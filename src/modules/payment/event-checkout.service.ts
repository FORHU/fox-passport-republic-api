import { prisma } from "../../utils/prisma";
import InvoiceSvc from "./invoice.service";
import CheckoutSvc from "./checkout.service";
import PricingSvc from "../pricing/pricing.service";
import { InvoiceSourceType, Prisma } from "@prisma/client";

const REUSABLE_STATUSES = ["pending", "processing"] as const;

export default class EventCheckoutSvc {
  /**
   * The event and its payable (accepted, unpaid) transactions — shared by
   * `createEventCheckout` and `getPaymentSummary` so "what counts as
   * payable" exists in exactly one place rather than drifting between the
   * endpoint that charges and the one that only previews the charge.
   */
  private static async getPayableItems(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venueTransactions: {
          where: { status: "pending" }, // Assuming 'pending' means accepted by provider but pending payment
        },
        assetTransactions: {
          where: { status: "pending" },
        },
        serviceTransactions: {
          where: { status: "pending" },
        },
      },
    });

    if (!event) throw new Error("Event not found");

    const items: Parameters<typeof InvoiceSvc.createInvoice>[0]["items"] = [];

    event.venueTransactions.forEach((tx) => {
      items.push({
        amount: tx.agreedPrice,
        description: `Venue Reservation: ${tx.id}`,
        sourceType: InvoiceSourceType.event_venue_transaction,
        sourceId: tx.id,
      });
    });

    event.assetTransactions.forEach((tx) => {
      items.push({
        amount: tx.agreedPrice,
        description: `Gear Rental: ${tx.id}`,
        sourceType: InvoiceSourceType.event_asset_transaction,
        sourceId: tx.id,
      });
    });

    event.serviceTransactions.forEach((tx) => {
      items.push({
        amount: tx.agreedPrice,
        description: `Talent Service: ${tx.id}`,
        sourceType: InvoiceSourceType.event_service_transaction,
        sourceId: tx.id,
      });
    });

    return { event, items };
  }

  /**
   * Generates a consolidated invoice and checkout session for an Event.
   * Finds all accepted transactions (Venue, Gear, Talent) for this event.
   *
   * Retry-safe: a double-click, a lost response, or a frontend retry hitting
   * this twice in a row must not throw `InvoiceSvc.createInvoice`'s
   * double-invoicing guard — it reuses whatever invoice is already open for
   * this event's items instead of trying to create a second one.
   */
  static async createEventCheckout(
    eventId: string,
    payerId: string,
    voucherCode?: string,
  ) {
    const { event, items } = await this.getPayableItems(eventId);

    if (event.clientId !== payerId) {
      throw new Error("Unauthorized: only this event's client may pay for it");
    }
    if (items.length === 0) {
      throw new Error("No payable transactions found for this event.");
    }

    // Two concurrent requests for the same event (not just a slow retry
    // after the first has already committed) would otherwise both pass
    // `findInvoiceForSource`'s check before either's `createInvoice` call
    // commits, producing two Invoices for the same items — the guard in
    // `InvoiceSvc.createInvoice` runs inside its own transaction and can't
    // see another in-flight one. `pg_advisory_xact_lock` serializes callers
    // on this event: the second caller blocks here until the first's whole
    // find-or-create flow below has committed, and then correctly finds
    // (and reuses) what the first one just created.
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`event-checkout:${eventId}`}, 0))`;

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
            const checkout = await CheckoutSvc.createCheckout(existing.id);
            return { ...checkout, invoice: existing };
          }
          // cancelled/failed/refunded — not blocking, falls through to a fresh invoice below.
        }

        // Build Pricing Context
        const pricingContext = {
          transactionType: "event",
          // `Event` has no `type` field — `eventCategory` is the enum that
          // carries this (corporate/birthday/wedding/social/other), and it's
          // required, so there's nothing to fall back from.
          category: event.eventCategory,
          voucherCode,
        };

        // Create Invoice
        const invoice = await InvoiceSvc.createInvoice({
          payerId,
          pricingContext,
          items,
          dueDate: event.startAt, // Payment due by event start
        });

        // Create Checkout Session
        const checkout = await CheckoutSvc.createCheckout(invoice.id);

        return { ...checkout, invoice };
      },
      { timeout: 15000 }, // generous — may wait behind another caller's full create flow, not just its own work
    );
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
    voucherCode?: string,
  ) {
    const { event, items } = await this.getPayableItems(eventId);

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

    const pricingContext = {
      transactionType: "event",
      category: event.eventCategory,
      voucherCode,
      userId: callerId,
    };
    const breakdown = await PricingSvc.calculatePrice(subtotal, pricingContext);

    return {
      eventId,
      currency: "PHP",
      subtotalAmount: breakdown.subtotal,
      discountAmount: breakdown.discount?.amount ?? 0,
      platformFeeAmount: breakdown.platformFee?.amount ?? 0,
      grossAmount: breakdown.finalAmount,
    };
  }
}
