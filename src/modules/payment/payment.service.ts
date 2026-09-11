import PaymentRepo from "./payment.repository";
import BookingRepo from "../booking/booking.repository";
import crypto from "crypto";
import {
  BookingStatus,
  PaymentStatus,
  TransactionStatus,
} from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "../../utils/prisma";
import { bookingCache } from "../../utils/cache-namespaces";

/**
 * Payments are cached in the **booking** namespace, not one of their own.
 *
 * They are the same payload - `BookingRepo.findById` includes `payments`, and
 * the balance below is computed from a booking - and they are changed by the
 * same writes. Both repositories already retire that namespace at every write,
 * so these reads arrive invalidated with no new invalidation point to
 * remember. A `payment` namespace would need every one of those writes to bump
 * two counters instead of one, and the second one is the one somebody forgets.
 *
 * The TTL is a floor on how wrong a read can be if a bump is ever missed, not
 * the mechanism keeping it right - §2b of `docs/REDIS-PLAN.md` is explicit that
 * payment status must not rely on expiry, because a citizen who has just paid
 * and is shown "unpaid" pays twice.
 */
const PAYMENT_TTL = 30;
import { toStripeCents } from "../../utils/pricing";
import RefundSvc from "../refund/refund.service";
import StripeConnectSvc from "../stripe-connect/stripe-connect.service";
import {
  announceToAdmins,
  announceToUser,
} from "../../infrastructure/socket/invalidate";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

export default class PaymentSvc {
  /**
   * Cancel payments whose window has closed, and the pending bookings behind
   * them.
   *
   * A write that happens on the way into a read - every payment and booking
   * read calls it first - which is why it needs a cache bump nobody would think
   * to look for. It cancels *other people's* bookings, so the entries it
   * invalidates are not the ones the caller is about to fill.
   *
   * The repository method returns how many it cancelled, so the common case -
   * nothing expired - costs no invalidation at all. Call this rather than
   * `PaymentRepo.cancelExpiredPayments` directly; that is the whole point of it
   * being here.
   */
  static async sweepExpiredPayments(): Promise<number> {
    const cancelled = await PaymentRepo.cancelExpiredPayments();
    if (cancelled > 0) await bookingCache.invalidateAll();
    return cancelled;
  }

  // Generate unique transaction ID
  static generateTransactionId(): string {
    return `TXN-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  }

  // CREATE STRIPE PAYMENT INTENT
  static async createPaymentIntent(data: {
    amount: number;
    currency?: string;
    bookingId: string;
    description?: string;
  }) {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: toStripeCents(data.amount),
      currency: (data.currency || "PHP").toLowerCase(),
      metadata: {
        bookingId: data.bookingId,
      },
      description: data.description,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  }

  // REFUND a captured Stripe payment intent
  static async refundPayment(paymentIntentId: string): Promise<void> {
    await stripe.refunds.create({ payment_intent: paymentIntentId });
  }

  // GET ALL PAYMENTS
  static async getAllPayments(filters?: {
    bookingId?: string;
    paymentStatus?: PaymentStatus;
  }) {
    // Outside the cached block on purpose: the sweep is a write, and skipping
    // it on a cache hit would leave expired payments pending for as long as the
    // entry lived.
    await this.sweepExpiredPayments();

    const key = `payments:all:${filters?.bookingId ?? "*"}:${
      filters?.paymentStatus ?? "*"
    }`;
    return bookingCache.cached(key, PAYMENT_TTL, () =>
      PaymentRepo.getAllPayments(filters),
    );
  }

  // GET PAYMENT BY ID
  static async getPaymentById(id: string) {
    await this.sweepExpiredPayments();

    const payment = await bookingCache.cached(
      `payments:id:${id}`,
      PAYMENT_TTL,
      () => PaymentRepo.getPaymentById(id),
    );
    if (!payment) {
      throw new Error("Payment not found");
    }
    return payment;
  }

  // GET PAYMENT BY TRANSACTION ID
  static async getPaymentByTransactionId(transactionId: string) {
    await this.sweepExpiredPayments();

    const payment = await bookingCache.cached(
      `payments:txn:${transactionId}`,
      PAYMENT_TTL,
      () => PaymentRepo.getPaymentByTransactionId(transactionId),
    );
    if (!payment) {
      throw new Error("Payment not found");
    }
    return payment;
  }

  // CREATE PAYMENT
  static async createPayment(data: {
    bookingId: string;
    amount: number;
    currency: string;
    method: string;
    paymentType: "deposit" | "full";
    paymentStatus?: PaymentStatus;
    expiresAt?: Date;
    transactionId?: string;
    paidAt?: Date;
  }) {
    let transactionId = data.transactionId || this.generateTransactionId();
    while (
      !data.transactionId &&
      (await PaymentRepo.transactionIdExists(transactionId))
    ) {
      transactionId = this.generateTransactionId();
    }

    const paymentStatus = data.paymentStatus || PaymentStatus.pending;
    const payment = await PaymentRepo.createPayment({
      bookingId: data.bookingId,
      amount: data.amount,
      currency: data.currency || "PHP",
      method: data.method,
      paymentType: data.paymentType,
      paymentStatus,
      transactionId,
      expiresAt: data.expiresAt,
      paidAt:
        data.paidAt ||
        (paymentStatus === PaymentStatus.completed ? new Date() : undefined),
    });

    // If this payment is a Stripe payment (either method explicitly 'stripe'
    // or the transactionId looks like a Stripe PaymentIntent ID), store the
    // Stripe id on the Booking.stripePaymentId field so the booking is linked
    // to the Stripe payment externally. This keeps booking.stripePaymentId
    // populated for downstream reporting and idempotency checks.
    try {
      const looksLikeStripeId =
        String(transactionId).startsWith("pi_") || data.method === "stripe";
      if (looksLikeStripeId) {
        await BookingRepo.setStripePaymentId(data.bookingId, transactionId);
      }
    } catch (err) {
      // Non-fatal: log and continue. Do not fail the payment creation because
      // booking stripePaymentId couldn't be written (unique constraint, etc).
      console.error("Failed to write stripePaymentId to booking:", err);
    }

    return payment;
  }

  // UPDATE PAYMENT
  static async updatePayment(
    id: string,
    data: Partial<{
      paymentStatus: PaymentStatus;
    }>,
  ) {
    // Check if payment exists and is not expired/cancelled
    const payment = await PaymentRepo.getPaymentById(id);
    if (!payment) {
      throw new Error("Payment not found");
    }

    if (payment.status === PaymentStatus.cancelled) {
      throw new Error("Cannot update a cancelled payment");
    }

    if (
      payment.expiresAt &&
      new Date() > payment.expiresAt &&
      payment.status === PaymentStatus.pending
    ) {
      await this.sweepExpiredPayments();
      throw new Error("Payment has expired and is now cancelled");
    }

    const updated = await PaymentRepo.updatePayment(id, {
      paymentStatus: data.paymentStatus,
      paidAt:
        data.paymentStatus === PaymentStatus.completed
          ? (payment.paidAt ?? new Date())
          : undefined,
    });

    if (
      data.paymentStatus === PaymentStatus.completed &&
      (updated.paymentType === "deposit" || updated.paymentType === "full")
    ) {
      // Full payment means the citizen has paid in full — it does NOT mean the event
      // has happened yet. Mirrors AssetBooking/ServiceBooking's confirmPayment, which
      // also lands on "confirmed": confirmArrival ("confirmed"/"pending" -> "active")
      // and updateStatus(completed) (-> "completed", which triggers provider payouts)
      // happen afterward, never automatically on payment. See
      // docs/adr/0002-stripe-connect-payouts.md ("Payout timing: on status -> completed").
      // The repository retires the cache - the booking page is what the
      // citizen is looking at when this lands.
      await BookingRepo.markConfirmed(updated.bookingId);

      // Auto-approve all included pending item transactions now that payment is confirmed.
      // Without this, venue/asset/service transactions stay "pending" forever and
      // providers won't receive payouts (payout fan-out iterates included txns).
      await this.approveBookingTransactions(updated.bookingId);
    }

    return updated;
  }

  /**
   * What is still owed on a booking.
   *
   * Cached as the computed answer rather than as its inputs: the arithmetic is
   * the expensive-to-get-right part, not the query, and every write that could
   * change it - a payment completing, a booking cancelling - retires this
   * namespace.
   */
  static async getRemainingBalance(bookingId: string) {
    return bookingCache.cached(
      `payments:balance:${bookingId}`,
      PAYMENT_TTL,
      () => this.computeRemainingBalance(bookingId),
    );
  }

  private static async computeRemainingBalance(bookingId: string) {
    const booking = await BookingRepo.findById(bookingId);
    if (!booking) throw new Error("Booking not found");

    // Use the server-computed, trustworthy Event.totalAmount (itemsTotal +
    // hostMarkupAmount + platformFeeAmount) rather than re-summing only the item
    // transactions — re-summing silently excluded Host markup and platform fee.
    // These columns are Prisma `Decimal`, not `number`. decimal.js defines
    // valueOf() as a *string*, so `0 + amount` concatenates instead of adding —
    // the previous `any` casts hid that. Convert explicitly before arithmetic.
    const totalAgreed = Number(booking.event?.totalAmount ?? 0);

    const paidAmount = (booking.payments ?? [])
      .filter((p) => p.status === PaymentStatus.completed)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      totalAmount: totalAgreed,
      paidAmount,
      remainingBalance: Math.max(0, totalAgreed - paidAmount),
      currency: "PHP",
    };
  }

  /**
   * One booking's payments. On the confirmation path, which is why it is the
   * read this section was most careful about: it decides whether a pending
   * payment is completed or a fresh one created, so a stale answer here writes
   * a second payment row rather than merely showing a wrong number.
   *
   * It is safe because it is retired at the write, not at the TTL - and because
   * `confirmPayment` reads it *before* it writes anything, so its own writes
   * cannot race it.
   */
  static async getBookingPayments(bookingId: string) {
    return bookingCache.cached(
      `payments:booking:${bookingId}`,
      PAYMENT_TTL,
      () => PaymentRepo.getBookingPayments(bookingId),
    );
  }

  /**
   * Bulk-approve all included pending item transactions for a booking.
   * Called when payment is completed → booking confirmed, so that providers
   * are eligible for payouts when the booking later moves to "completed".
   */
  private static async approveBookingTransactions(bookingId: string) {
    try {
      await prisma.$transaction([
        prisma.eventAssetTransaction.updateMany({
          where: {
            bookingId,
            included: true,
            status: TransactionStatus.pending,
          },
          data: { status: TransactionStatus.approved },
        }),
        prisma.eventServiceTransaction.updateMany({
          where: {
            bookingId,
            included: true,
            status: TransactionStatus.pending,
          },
          data: { status: TransactionStatus.approved },
        }),
        prisma.eventVenueTransaction.updateMany({
          where: {
            bookingId,
            included: true,
            status: TransactionStatus.pending,
          },
          data: { status: TransactionStatus.approved },
        }),
      ]);
    } catch (err) {
      // Non-fatal: log but don't fail the payment update. Providers can still
      // be approved manually via the reviewItem endpoint.
      console.error(
        `Failed to auto-approve transactions for booking ${bookingId}:`,
        err,
      );
    }
  }

  /**
   * Everything the Stripe webhook does once the signature has been verified.
   *
   * The controller keeps the signature check - that needs the raw body and the
   * request headers, which are HTTP concerns - and hands the decoded event
   * here. Everything below used to sit in the controller with its own `prisma`
   * calls; see `docs/REDIS-PLAN.md` §0b.
   *
   * Nothing in here throws. A webhook that 500s gets retried by Stripe, and
   * every one of these paths is either idempotent or already committed, so a
   * retry storm would achieve nothing but load.
   */
  static async handleStripeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "payment_intent.succeeded":
        await this.settleSucceededIntent(
          event.data.object as Stripe.PaymentIntent,
        );
        break;

      case "payment_intent.payment_failed": {
        const failedIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`❌ PaymentIntent failed: ${failedIntent.id}`);
        break;
      }

      case "charge.refunded":
        await this.markChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case "refund.updated": {
        const refundUpdated = event.data.object as Stripe.Refund;
        if (refundUpdated.status === "failed") {
          await RefundSvc.handleWebhookRefundFailed(event);
        } else if (refundUpdated.status === "succeeded") {
          await RefundSvc.handleWebhookRefundSucceeded(event);
        }
        break;
      }

      case "account.updated":
        // Keeps User.stripeChargesEnabled/stripePayoutsEnabled/stripeOnboardingComplete
        // in sync with the connected account's real state. See
        // docs/adr/0002-stripe-connect-payouts.md. Deployment note: the Stripe
        // webhook endpoint must also be subscribed to this event type.
        try {
          const account = event.data.object as Stripe.Account;
          await StripeConnectSvc.handleAccountUpdated(account);
          console.log(`✅ account.updated synced for ${account.id}`);
        } catch (error) {
          console.error("Error syncing account.updated via webhook:", error);
        }
        break;

      default:
        console.log(`ℹ️ Unhandled event type ${event.type}`);
    }
  }

  /**
   * A payment that succeeded at Stripe: record it, link it, and confirm the
   * booking if it was still waiting to be paid for.
   */
  private static async settleSucceededIntent(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    const bookingId = paymentIntent.metadata.bookingId;

    console.log(
      `✅ PaymentIntent succeeded: ${paymentIntent.id} for booking ${bookingId}`,
    );

    try {
      // Loaded before anything is mutated, so the decisions below are made
      // against the state Stripe's delivery arrived at.
      const booking = await BookingRepo.findPaymentContext(bookingId);

      const payments = await this.getBookingPayments(bookingId);
      const pendingPayment = payments.find(
        (p) => p.status === PaymentStatus.pending,
      );

      if (pendingPayment) {
        await this.updatePayment(pendingPayment.id, {
          paymentStatus: PaymentStatus.completed,
        });
        await PaymentRepo.setTransactionId(pendingPayment.id, paymentIntent.id);
      } else {
        // If no pending payment found, create a completed one
        await this.createPayment({
          bookingId,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          method: "stripe",
          paymentType: "full",
          paymentStatus: PaymentStatus.completed,
          transactionId: paymentIntent.id,
        });
      }

      // Link the Stripe PaymentIntent id to the Booking (idempotent).
      if (booking && booking.stripePaymentId !== paymentIntent.id) {
        try {
          await BookingRepo.setStripePaymentId(bookingId, paymentIntent.id);
        } catch (err) {
          console.error(
            "Failed to set booking.stripePaymentId in webhook:",
            err,
          );
        }
      }

      // Mark the booking confirmed so it can later be checked-in/settled.
      // Only when it's still pending — never un-complete or un-cancel a booking.
      if (booking && booking.status === BookingStatus.pending) {
        try {
          // The repository retires the cache before this returns, which is
          // what makes the announcement below safe: the client refetches the
          // booking the moment the socket message lands, and a webhook that
          // leaves it reading "unpaid" is how someone pays twice.
          await BookingRepo.markConfirmed(bookingId);

          // Inside the status check on purpose: Stripe retries deliveries, and
          // a redelivery for an already-confirmed intent has changed nothing
          // worth telling anyone about.
          announceToUser(booking.userId, "bookings");
          announceToUser(booking.event?.organizerId, "bookings");
          announceToAdmins("bookings");
        } catch (err) {
          console.error(
            "Failed to set booking.status to confirmed in webhook:",
            err,
          );
        }
      }
    } catch (error) {
      console.error("Error updating payment via webhook:", error);
    }
  }

  /** Stripe refunded a charge outside our own refund flow. */
  private static async markChargeRefunded(
    charge: Stripe.Charge,
  ): Promise<void> {
    if (!charge.refunded || !charge.payment_intent) return;

    const piId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent.id;

    const payment = await PaymentRepo.findFirstByTransactionId(piId);
    if (!payment) return;

    await PaymentRepo.markRefunded(payment.id);
  }
}
