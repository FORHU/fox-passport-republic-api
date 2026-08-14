import Stripe from "stripe";
import { prisma } from "../utils/prisma";
import { RoleType, PayoutStatus } from "@prisma/client";
import { STRIPE_SECRET_KEY } from "../config";

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

/**
 * Unified payout ledger — see docs/adr/0002-stripe-connect-payouts.md.
 * Every Transfer to a Mayor/Foxer/Host goes through here, regardless of which
 * flow it came from (direct Asset/Service booking, or a multi-provider Event
 * booking). Separate Charges and Transfers: the citizen's payment already
 * landed in the platform's own Stripe balance (PaymentIntent) — this only
 * moves the recipient's share out of that balance afterward.
 */
export default class PayoutSvc {
  /**
   * Idempotency guard: the @@unique([sourceType, sourceId, recipientId, role])
   * constraint means calling this twice for the same recipient/source/role is
   * a no-op the second time (update: {}), so updateStatus(completed) being
   * called more than once never double-pays anyone.
   */
  static async createPayoutRecord(data: {
    recipientId: string;
    role: RoleType;
    sourceType: string;
    sourceId: string;
    amount: number;
    currency?: string;
  }) {
    return prisma.payout.upsert({
      where: {
        sourceType_sourceId_recipientId_role: {
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          recipientId: data.recipientId,
          role: data.role,
        },
      },
      create: {
        recipientId: data.recipientId,
        role: data.role,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        amount: data.amount,
        currency: data.currency ?? "PHP",
      },
      update: {}, // already exists — no-op, this is the idempotency guard
    });
  }

  /** Fires the actual Stripe Transfer for an existing (pending) Payout row. Never throws. */
  static async fireTransfer(payoutId: string): Promise<void> {
    const payout = await prisma.payout.findUnique({
      where: { id: payoutId },
      include: { recipient: true },
    });
    if (!payout) return;
    if (payout.status !== PayoutStatus.pending) return; // already paid or failed, don't retry blindly

    const recipient = payout.recipient;
    if (!recipient.stripeAccountId || !recipient.stripePayoutsEnabled) {
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.failed,
          failureReason:
            "Recipient has not completed Stripe Connect onboarding",
        },
      });
      return;
    }

    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(payout.amount.toNumber() * 100),
        currency: payout.currency.toLowerCase(),
        destination: recipient.stripeAccountId,
        transfer_group: payout.sourceId,
      });
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.paid,
          stripeTransferId: transfer.id,
          failureReason: null,
        },
      });
    } catch (e: unknown) {
      const err = e as Error;
      await prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.failed,
          failureReason: err.message ?? "Stripe transfer failed",
        },
      });
    }
  }

  private static async createAndFire(data: {
    recipientId: string;
    role: RoleType;
    sourceType: string;
    sourceId: string;
    amount: number;
    currency?: string;
  }) {
    const payout = await this.createPayoutRecord(data);
    await this.fireTransfer(payout.id);
  }

  /** Single-recipient payout: the Asset's owner gets totalAmount - platformFeeAmount. */
  static async createPayoutsForAssetBooking(bookingId: string) {
    const booking = await prisma.assetBooking.findUnique({
      where: { id: bookingId },
      include: { asset: { include: { owner: true } } },
    });
    if (!booking) return;

    const results = await Promise.allSettled([
      this.createAndFire({
        recipientId: booking.asset.ownerId,
        role: RoleType.gearFoxer,
        sourceType: "assetBooking",
        sourceId: booking.id,
        amount: booking.totalAmount.sub(booking.platformFeeAmount).toNumber(),
      }),
    ]);
    this.logFailures(results, "assetBooking", bookingId);
  }

  /** Single-recipient payout: the Service's owner gets totalAmount - platformFeeAmount. */
  static async createPayoutsForServiceBooking(bookingId: string) {
    const booking = await prisma.serviceBooking.findUnique({
      where: { id: bookingId },
      include: { service: { include: { owner: true } } },
    });
    if (!booking) return;

    const results = await Promise.allSettled([
      this.createAndFire({
        recipientId: booking.service.ownerId,
        role: RoleType.serviceFoxer,
        sourceType: "serviceBooking",
        sourceId: booking.id,
        amount: booking.totalAmount.sub(booking.platformFeeAmount).toNumber(),
      }),
    ]);
    this.logFailures(results, "serviceBooking", bookingId);
  }

  /**
   * Multi-recipient fan-out for an Event booking: one Payout per included
   * asset/service/venue transaction, plus one to the Host for their markup.
   * The platform's own platformFeeAmount is never paid out — it simply stays
   * in the platform's Stripe balance (Separate Charges and Transfers).
   */
  static async createPayoutsForEventBooking(bookingId: string) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: true,
        assetTransactions: { where: { included: true } },
        serviceTransactions: { where: { included: true } },
        venueTransactions: { where: { included: true } },
      },
    });
    if (!booking) return;

    const jobs: Promise<void>[] = [];

    // sourceId is the transaction row's own id (not booking.id) — necessary because
    // a single provider can supply more than one item to the same event (e.g. two
    // separate Assets owned by the same Foxer). Using booking.id alone would collide
    // on the (sourceType, sourceId, recipientId, role) unique constraint and silently
    // drop the second item's payout.
    for (const tx of booking.assetTransactions) {
      jobs.push(
        this.createAndFire({
          recipientId: tx.providerId,
          role: RoleType.gearFoxer,
          sourceType: "eventAssetTransaction",
          sourceId: tx.id,
          amount: tx.agreedPrice.toNumber(),
        }),
      );
    }
    for (const tx of booking.serviceTransactions) {
      jobs.push(
        this.createAndFire({
          recipientId: tx.providerId,
          role: RoleType.serviceFoxer,
          sourceType: "eventServiceTransaction",
          sourceId: tx.id,
          amount: tx.agreedPrice.toNumber(),
        }),
      );
    }
    for (const tx of booking.venueTransactions) {
      jobs.push(
        this.createAndFire({
          recipientId: tx.providerId,
          role: RoleType.venueFoxer,
          sourceType: "eventVenueTransaction",
          sourceId: tx.id,
          amount: tx.agreedPrice.toNumber(),
        }),
      );
    }
    // Host's own cut — one per booking (sourceId = booking.id is fine here, there's
    // only ever one Host per Event).
    jobs.push(
      this.createAndFire({
        recipientId: booking.event.organizerId,
        role: RoleType.eventFoxer,
        sourceType: "eventHostMarkup",
        sourceId: booking.id,
        amount: booking.event.hostMarkupAmount.toNumber(),
      }),
    );

    const results = await Promise.allSettled(jobs);
    this.logFailures(results, "booking", bookingId);
  }

  private static logFailures(
    results: PromiseSettledResult<void>[],
    sourceType: string,
    sourceId: string,
  ) {
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(
          `Payout job failed for ${sourceType} ${sourceId}`,
          r.reason,
        );
      }
    }
  }
}
