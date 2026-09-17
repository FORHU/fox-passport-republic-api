import Stripe from "stripe";
import { prisma, AppTransactionClient } from "../../utils/prisma";
import InvoiceSvc from "./invoice.service";
import CheckoutSvc from "./checkout.service";
import PricingSvc from "../pricing/pricing.service";
import RefundSvc from "../refund/refund.service";
import PromotionSvc from "../promotion/promotion.service";
import PayoutSvc from "../payout/payout.service";
import NotificationService from "../notifications/user-notification.service";
import AvailabilitySvc from "../availability/availability.service";
import { STRIPE_SECRET_KEY } from "../../config";
import { toStripeCents, formatCurrency } from "../../utils/pricing";
import {
  InvoiceSourceType,
  Prisma,
  RefundStatus,
  TransactionStatus,
} from "@prisma/client";

const REUSABLE_STATUSES = ["pending", "processing"] as const;
// Both are payable: `pending` is a pre-attached item, which never required
// confirmation (Design A); `approved` is an ad-hoc marketplace item the
// provider has confirmed. `pending_provider_confirmation` blocks checkout
// entirely (see BlockingItemsError below) rather than being silently
// excluded — a citizen who selected an item should see why it isn't being
// charged, not have it quietly vanish from the invoice.
const PAYABLE_STATUSES = ["pending", "approved"] as const;

export class BlockingItemsError extends Error {
  constructor(public readonly blockingItemIds: string[]) {
    super(
      `Checkout is blocked: ${blockingItemIds.length} item(s) are still awaiting provider confirmation`,
    );
    this.name = "BlockingItemsError";
  }
}

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

export default class EventCheckoutSvc {
  /**
   * The event and its payable (accepted, unpaid) transactions — shared by
   * `createEventCheckout` and `getPaymentSummary` so "what counts as
   * payable" exists in exactly one place rather than drifting between the
   * endpoint that charges and the one that only previews the charge.
   *
   * `tx`: optional, so `createEventCheckout` can read this under its own
   * transaction/lock rather than a separate, potentially stale read.
   */
  private static async getPayableItems(
    eventId: string,
    tx: AppTransactionClient = prisma,
  ) {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      include: {
        bookings: { select: { id: true }, take: 1 },
        venueTransactions: {
          where: { status: "pending" },
          include: {
            venue: { select: { name: true, category: true } },
            provider: { select: { name: true } },
          },
        },
        assetTransactions: {
          where: { status: { in: [...PAYABLE_STATUSES] } },
          include: {
            asset: { select: { name: true, category: true } },
            provider: { select: { name: true } },
          },
        },
        serviceTransactions: {
          where: { status: { in: [...PAYABLE_STATUSES] } },
          include: {
            service: { select: { name: true, category: true } },
            provider: { select: { name: true } },
          },
        },
      },
    });

    if (!event) throw new Error("Event not found");

    // Anything still awaiting provider confirmation blocks checkout
    // entirely, cleanly, rather than being silently dropped from the
    // invoice — a citizen who picked an item should see why it isn't
    // charged, not have it quietly disappear.
    const [blockingAssets, blockingServices] = await Promise.all([
      tx.eventAssetTransaction.findMany({
        where: { eventId, status: "pending_provider_confirmation" },
        select: { id: true },
      }),
      tx.eventServiceTransaction.findMany({
        where: { eventId, status: "pending_provider_confirmation" },
        select: { id: true },
      }),
    ]);
    const blockingIds = [
      ...blockingAssets.map((a) => a.id),
      ...blockingServices.map((s) => s.id),
    ];
    if (blockingIds.length > 0) {
      throw new BlockingItemsError(blockingIds);
    }

    const items: Parameters<typeof InvoiceSvc.createInvoice>[0]["items"] = [];
    // Each item's own scope — feeds `PricingSvc.resolveEventLineItemDiscounts`
    // so a Foxer-owned voucher can match the exact listing it was scoped to,
    // the same way it would on a direct asset/service/venue booking.
    const pricingItems: Parameters<
      typeof PricingSvc.resolveEventLineItemDiscounts
    >[0] = [];
    // Citizen-facing breakdown for the payment panel — which venue/gear/
    // talent this payment actually covers, unlike `items` above whose
    // `description` is just an internal transaction id.
    const displayItems: Array<{
      type: "venue" | "asset" | "service";
      name: string;
      providerName: string;
      amount: number;
    }> = [];

    const toNumber = (amount: Prisma.Decimal | number) =>
      amount instanceof Prisma.Decimal ? amount.toNumber() : amount;

    event.venueTransactions.forEach((t) => {
      items.push({
        amount: t.agreedPrice,
        description: `Venue Reservation: ${t.id}`,
        sourceType: InvoiceSourceType.event_venue_transaction,
        sourceId: t.id,
      });
      pricingItems.push({
        sourceId: t.id,
        amount: toNumber(t.agreedPrice),
        transactionType: "venue",
        category: t.venue.category,
        venueId: t.venueId,
      });
      displayItems.push({
        type: "venue",
        name: t.venue.name,
        providerName: t.provider.name,
        amount: toNumber(t.agreedPrice),
      });
    });

    event.assetTransactions.forEach((t) => {
      items.push({
        amount: t.agreedPrice,
        description: `Gear Rental: ${t.id}`,
        sourceType: InvoiceSourceType.event_asset_transaction,
        sourceId: t.id,
      });
      pricingItems.push({
        sourceId: t.id,
        amount: toNumber(t.agreedPrice),
        transactionType: "asset",
        category: t.asset.category,
        assetId: t.assetId,
      });
      displayItems.push({
        type: "asset",
        name: t.asset.name,
        providerName: t.provider.name,
        amount: toNumber(t.agreedPrice),
      });
    });

    event.serviceTransactions.forEach((t) => {
      items.push({
        amount: t.agreedPrice,
        description: `Talent Service: ${t.id}`,
        sourceType: InvoiceSourceType.event_service_transaction,
        sourceId: t.id,
      });
      pricingItems.push({
        sourceId: t.id,
        amount: toNumber(t.agreedPrice),
        transactionType: "service",
        category: t.service.category,
        serviceId: t.serviceId,
      });
      displayItems.push({
        type: "service",
        name: t.service.name,
        providerName: t.provider.name,
        amount: toNumber(t.agreedPrice),
      });
    });

    return { event, items, pricingItems, displayItems };
  }

  /**
   * Generates a consolidated invoice and checkout session for an Event.
   * Finds all accepted transactions (Venue, Gear, Talent) for this event.
   *
   * Retry-safe: a double-click, a lost response, or a frontend retry hitting
   * this twice in a row must not throw `InvoiceSvc.createInvoice`'s
   * double-invoicing guard — it reuses whatever invoice is already open for
   * this event's items instead of trying to create a second one.
   *
   * `voucherCodes` may mix any number of Foxer-owned codes (each matched to
   * its own line item — see `PricingSvc.resolveEventLineItemDiscounts`) with
   * at most one platform-wide code. There's no "one code per checkout"
   * limit here: a citizen can redeem every voucher they're eligible for
   * across this event's different providers in one go, same as any
   * multi-seller marketplace cart.
   */
  /**
   * The full checkout-initiation sequence, all inside one transaction:
   * advisory lock -> lock booking -> verify ownership/status/expiry ->
   * lock+revalidate availability -> validate item statuses (via
   * getPayableItems' blocking-item check) -> recompute prices/total
   * (PricingSvc, inside InvoiceSvc.createInvoice) -> prevent duplicate
   * checkout (findInvoiceForSource, still inside the lock) -> create
   * Invoice + pending Checkout -> commit. The real Stripe call happens
   * strictly AFTER this transaction returns — never inside it — so a
   * network failure or crash talking to Stripe cannot leave a committed
   * Invoice with an inconsistent Checkout, and holding a DB transaction
   * open across a network round-trip is avoided entirely.
   */
  static async createEventCheckout(
    eventId: string,
    payerId: string,
    voucherCodes: string[] = [],
  ) {
    // Two concurrent requests for the same event (not just a slow retry
    // after the first has already committed) would otherwise both pass
    // `findInvoiceForSource`'s check before either's `createInvoice` call
    // commits, producing two Invoices for the same items — the guard in
    // `InvoiceSvc.createInvoice` runs inside its own transaction and can't
    // see another in-flight one. `pg_advisory_xact_lock` serializes callers
    // on this event: the second caller blocks here until the first's whole
    // find-or-create flow below has committed, and then correctly finds
    // (and reuses) what the first one just created.
    const { checkout, invoice } = await prisma.$transaction(
      async (tx) => {
        // Serializes every concurrent caller for this event — the second
        // caller's advisory-lock acquisition blocks until the first's
        // entire flow below (now genuinely inside this same transaction,
        // not a separately-committing nested one) has committed or rolled
        // back.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-checkout:${eventId}`}, 0))`;

        const { event, items, pricingItems } = await this.getPayableItems(
          eventId,
          tx,
        );

        if (event.clientId !== payerId) {
          throw new Error(
            "Unauthorized: only this event's client may pay for it",
          );
        }
        if (items.length === 0) {
          throw new Error("No payable transactions found for this event.");
        }

        // Lock the booking row itself — belt-and-suspenders alongside the
        // advisory lock above, and the mechanism that actually matches the
        // approved design's "lock booking" step in the checkout sequence.
        const booking = event.bookings[0];
        if (!booking) {
          throw new Error(
            "This event has no booking to check out — nothing to charge.",
          );
        }
        await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${booking.id} FOR UPDATE`;

        // Re-validate availability for every payable item under the same
        // lock used everywhere else — closes the exact race the approved
        // design named: confirmation or availability changing between
        // checkout-open and payment-submit must be caught here, not
        // trusted from when the screen was opened.
        const availabilityItems = [
          ...event.assetTransactions.map((t) => ({
            kind: "asset" as const,
            itemId: t.assetId,
            dateRange: { start: event.startAt, end: event.endAt },
            quantity: t.quantity,
          })),
          ...event.serviceTransactions.map((t) => ({
            kind: "service" as const,
            itemId: t.serviceId,
            dateRange: { start: event.startAt, end: event.endAt },
          })),
        ];
        if (availabilityItems.length > 0) {
          await AvailabilitySvc.validateForCheckout(
            tx,
            booking.id,
            availabilityItems,
          );
        }

        // Every item here was added together from the same query, so finding
        // an invoice for any one of them means it covers all of them.
        const existing = await InvoiceSvc.findInvoiceForSource(
          items[0].sourceType,
          items[0].sourceId,
        );
        if (existing) {
          if (existing.status === "paid") {
            throw new Error("This event has already been paid for.");
          }
          if (
            (REUSABLE_STATUSES as readonly string[]).includes(existing.status)
          ) {
            const reusedCheckout = await CheckoutSvc.createPendingCheckout(
              tx,
              existing.id,
            );
            return { checkout: reusedCheckout, invoice: existing };
          }
          // cancelled/failed/refunded — not blocking, falls through to a fresh invoice below.
        }

        // Resolve every voucher code up front — a bad code (invalid,
        // matches nothing in this cart, two codes aimed at one item) must
        // fail the whole checkout attempt rather than silently create an
        // undiscounted invoice.
        const { itemDiscounts, blanketCode } =
          await PricingSvc.resolveEventLineItemDiscounts(
            pricingItems,
            voucherCodes,
            payerId,
          );

        // Build Pricing Context — only the blanket (platform-wide) code, if
        // any, flows through here; per-item discounts were already resolved
        // above and are passed to InvoiceSvc directly.
        const pricingContext = {
          transactionType: "event",
          // `Event` has no `type` field — `eventCategory` is the enum that
          // carries this (corporate/birthday/wedding/social/other), and it's
          // required, so there's nothing to fall back from.
          category: event.eventCategory,
          voucherCode: blanketCode,
        };

        // Create Invoice — prices/total recomputed here from the
        // `agreedPrice` values just re-read under lock, never from
        // anything client-supplied.
        const newInvoice = await InvoiceSvc.createInvoice(
          {
            payerId,
            pricingContext,
            items,
            itemDiscounts,
            dueDate: event.startAt, // Payment due by event start
          },
          tx,
        );

        // DB-only half of checkout creation — no Stripe call yet.
        const newCheckout = await CheckoutSvc.createPendingCheckout(
          tx,
          newInvoice.id,
        );

        return { checkout: newCheckout, invoice: newInvoice };
      },
      { timeout: 15000 }, // generous — may wait behind another caller's full flow, not just its own work
    );

    // Only after the transaction above has committed: the real Stripe call.
    const session = await CheckoutSvc.initiateProviderSession(
      checkout.id,
      invoice.id,
      invoice.grossAmount.toNumber(),
      invoice.currency,
    );

    return { ...session, invoice };
  }

  /**
   * Read-only pricing preview for the event payment panel — subtotal,
   * discount, fee and total *before* the citizen commits to Pay Now.
   * Deliberately does not create an Invoice: doing that just to preview a
   * price would trip the double-invoicing guard on the real attempt that
   * follows.
   */
  static async getPaymentSummary(
    eventId: string,
    callerId: string,
    voucherCodes: string[] = [],
  ) {
    const { event, items, pricingItems, displayItems } =
      await this.getPayableItems(eventId);

    if (event.clientId !== callerId) {
      throw new Error(
        "Unauthorized: only this event's client may view its payment summary",
      );
    }
    if (items.length === 0) {
      throw new Error("No payable transactions found for this event.");
    }

    const subtotal = items.reduce((sum, item) => {
      const amt =
        item.amount instanceof Prisma.Decimal
          ? item.amount.toNumber()
          : item.amount;
      return sum + amt;
    }, 0);

    // Same resolution `createEventCheckout` will run, so the preview always
    // matches what Pay Now actually charges.
    const { itemDiscounts, blanketCode } =
      await PricingSvc.resolveEventLineItemDiscounts(
        pricingItems,
        voucherCodes,
        callerId,
      );

    let itemDiscountsTotal = 0;
    for (const { discountAmount } of itemDiscounts.values()) {
      itemDiscountsTotal += discountAmount;
    }

    const itemsWithDiscount = displayItems.map((display, i) => ({
      ...display,
      discountAmount:
        itemDiscounts.get(pricingItems[i].sourceId)?.discountAmount ?? 0,
    }));

    const pricingContext = {
      transactionType: "event",
      category: event.eventCategory,
      voucherCode: blanketCode,
      userId: callerId,
    };
    const breakdown = await PricingSvc.calculatePrice(
      subtotal - itemDiscountsTotal,
      pricingContext,
    );

    return {
      eventId,
      currency: "PHP",
      items: itemsWithDiscount,
      subtotalAmount: subtotal,
      discountAmount: itemDiscountsTotal + (breakdown.discount?.amount ?? 0),
      platformFeeAmount: breakdown.platformFee?.amount ?? 0,
      grossAmount: breakdown.finalAmount,
    };
  }

  /**
   * Cancels a whole multi-provider Event booking and refunds it — the
   * Invoice-based counterpart to `BookingSvc.cancelWithRefunds` (which
   * covers the older, single-`Booking` model). There's no partial-item
   * cancellation here: the citizen cancels the whole Event in one action,
   * same as the Booking flow cancels the whole booking.
   *
   * Each line item gets its own refund percentage from *its own* provider's
   * cancellation policy (a Strict venue and a Flexible gear rental on the
   * same Event can refund differently), a separate Stripe refund against
   * the invoice's one shared PaymentIntent, and — if that item's payout
   * already transferred — a best-effort transfer reversal so the provider
   * doesn't keep money that was refunded to the citizen.
   */
  static async cancelEvent(eventId: string, requesterId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venueTransactions: {
          include: {
            venue: {
              include: { cancellationPolicy: { include: { rules: true } } },
            },
          },
        },
        assetTransactions: {
          include: {
            asset: {
              include: { cancellationPolicy: { include: { rules: true } } },
            },
          },
        },
        serviceTransactions: {
          include: {
            service: {
              include: { cancellationPolicy: { include: { rules: true } } },
            },
          },
        },
      },
    });
    if (!event) throw new Error("Event not found");
    if (event.clientId !== requesterId) {
      throw new Error("Unauthorized: only this event's client may cancel it");
    }
    if (event.eventStatus === "cancelled") {
      throw new Error("Event is already cancelled");
    }
    if (event.startAt.getTime() <= Date.now()) {
      throw new Error(
        "Event has already started — cancellation is no longer allowed",
      );
    }

    type CancellableTx = {
      id: string;
      status: TransactionStatus;
      sourceType: InvoiceSourceType;
      policy: {
        rules: { hoursBeforeEvent: number; refundPercent: number }[];
      } | null;
    };
    const allTx: CancellableTx[] = [
      ...event.venueTransactions.map((tx) => ({
        id: tx.id,
        status: tx.status,
        sourceType: InvoiceSourceType.event_venue_transaction,
        policy: tx.venue.cancellationPolicy,
      })),
      ...event.assetTransactions.map((tx) => ({
        id: tx.id,
        status: tx.status,
        sourceType: InvoiceSourceType.event_asset_transaction,
        policy: tx.asset.cancellationPolicy,
      })),
      ...event.serviceTransactions.map((tx) => ({
        id: tx.id,
        status: tx.status,
        sourceType: InvoiceSourceType.event_service_transaction,
        policy: tx.service.cancellationPolicy,
      })),
    ].filter((tx) => tx.status !== "cancelled");

    if (allTx.length === 0) {
      throw new Error("Nothing to cancel for this event.");
    }

    const invoice = await InvoiceSvc.findInvoiceForSource(
      allTx[0].sourceType,
      allTx[0].id,
    );

    // No invoice, or one that was never paid: nothing was charged, so
    // there's nothing to refund and nothing was ever redeemed (redemptions
    // are only recorded once payment succeeds — see WebhookSvc.
    // handlePaymentSuccess) — just cancel everything.
    if (!invoice || invoice.status !== "paid") {
      if (invoice && invoice.status === "pending") {
        await InvoiceSvc.cancelInvoice(invoice.id);
      }
      await prisma.$transaction([
        ...event.venueTransactions.map((tx) =>
          prisma.eventVenueTransaction.update({
            where: { id: tx.id },
            data: { status: TransactionStatus.cancelled },
          }),
        ),
        ...event.assetTransactions.map((tx) =>
          prisma.eventAssetTransaction.update({
            where: { id: tx.id },
            data: { status: TransactionStatus.cancelled },
          }),
        ),
        ...event.serviceTransactions.map((tx) =>
          prisma.eventServiceTransaction.update({
            where: { id: tx.id },
            data: { status: TransactionStatus.cancelled },
          }),
        ),
        prisma.event.update({
          where: { id: eventId },
          data: { eventStatus: "cancelled" },
        }),
      ]);
      return { refunds: [], totalRefunded: 0 };
    }

    const fullInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: { items: true, payments: { where: { status: "paid" } } },
    });
    const payment = fullInvoice?.payments[0];
    if (!fullInvoice || !payment) {
      throw new Error("No successful payment found for this event's invoice.");
    }

    const refunds = [];
    let totalRefunded = new Prisma.Decimal(0);

    for (const tx of allTx) {
      const invoiceItem = fullInvoice.items.find((i) => i.sourceId === tx.id);
      if (!invoiceItem) continue; // every transaction here was invoiced together — should always be found

      const { refundPercent, matchedRule } = RefundSvc.computeRefund(
        event.startAt,
        tx.policy,
      );
      const refundAmount = invoiceItem.amount.mul(refundPercent).div(100);

      let stripeRefundId: string | null = null;
      let status: RefundStatus = RefundStatus.succeeded;

      if (refundAmount.toNumber() > 0) {
        try {
          const stripeRefund = await stripe.refunds.create({
            payment_intent: payment.providerReference!,
            amount: toStripeCents(refundAmount.toNumber()),
          });
          status =
            stripeRefund.status === "succeeded"
              ? RefundStatus.succeeded
              : stripeRefund.status === "failed"
                ? RefundStatus.failed
                : RefundStatus.pending;
          stripeRefundId = stripeRefund.id;
        } catch (e: unknown) {
          const err = e as Error;
          status = RefundStatus.failed;
          console.error(
            `Event cancellation refund failed for invoice item ${invoiceItem.id} (event ${eventId}): ${err.message}`,
          );
        }
      }

      const refundRow = await prisma.refund.create({
        data: {
          paymentId: payment.id,
          invoiceItemId: invoiceItem.id,
          amount: refundAmount,
          providerReference: stripeRefundId,
          status,
          reason: matchedRule
            ? `${matchedRule.hoursBeforeEvent}h before = ${matchedRule.refundPercent}% refund`
            : "No cancellation policy matched — 0% refund",
        },
      });
      refunds.push(refundRow);
      if (status === RefundStatus.succeeded) {
        totalRefunded = totalRefunded.add(refundAmount);
      }

      await PayoutSvc.reversePayoutForSource(tx.id, refundAmount).catch((e) =>
        console.error(
          `Payout reversal failed for ${tx.id} (event ${eventId})`,
          e,
        ),
      );
    }

    await prisma.$transaction([
      ...event.venueTransactions.map((tx) =>
        prisma.eventVenueTransaction.update({
          where: { id: tx.id },
          data: { status: TransactionStatus.cancelled },
        }),
      ),
      ...event.assetTransactions.map((tx) =>
        prisma.eventAssetTransaction.update({
          where: { id: tx.id },
          data: { status: TransactionStatus.cancelled },
        }),
      ),
      ...event.serviceTransactions.map((tx) =>
        prisma.eventServiceTransaction.update({
          where: { id: tx.id },
          data: { status: TransactionStatus.cancelled },
        }),
      ),
      prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status:
            totalRefunded.toNumber() >= fullInvoice.grossAmount.toNumber()
              ? "refunded"
              : "partially_refunded",
        },
      }),
      prisma.event.update({
        where: { id: eventId },
        data: { eventStatus: "cancelled" },
      }),
    ]);

    // Voucher slots only free up once the cancellation itself has committed
    // — releasing first and having the transaction above fail would let a
    // citizen re-redeem a limited code against a booking that, from their
    // perspective, never actually got cancelled.
    await PromotionSvc.releaseInvoiceRedemptions(invoice.id).catch((e) =>
      console.error(
        `Failed to release voucher redemptions for invoice ${invoice.id} (event ${eventId})`,
        e,
      ),
    );

    // Immediate ack — the per-refund succeeded/failed follow-up (email +
    // this same in-app channel) fires later from RefundSvc's webhook
    // handlers once Stripe confirms each one, same as every other
    // cancellation flow in this codebase.
    NotificationService.create({
      userId: requesterId,
      type: "event_cancelled",
      title: "Event cancelled",
      message:
        totalRefunded.toNumber() > 0
          ? `${event.name} was cancelled. ${formatCurrency(totalRefunded.toNumber())} is being refunded.`
          : `${event.name} was cancelled.`,
      metadata: { link: `/event/${eventId}` },
    }).catch((e) =>
      console.error("Failed to create event-cancellation notification", e),
    );

    return { refunds, totalRefunded: totalRefunded.toNumber() };
  }
}
