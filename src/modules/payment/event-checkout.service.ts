import { prisma } from "../../utils/prisma";
import InvoiceSvc from "./invoice.service";
import CheckoutSvc from "./checkout.service";
import { InvoiceSourceType } from "@prisma/client";

export default class EventCheckoutSvc {
  /**
   * Generates a consolidated invoice and checkout session for an Event.
   * Finds all accepted transactions (Venue, Gear, Talent) for this event.
   */
  static async createEventCheckout(eventId: string, payerId: string, voucherCode?: string) {
    // 1. Fetch Event with all relevant accepted transactions
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

    // 2. Map Venue Transactions
    event.venueTransactions.forEach(tx => {
      items.push({
        amount: tx.agreedPrice,
        description: `Venue Reservation: ${tx.id}`,
        sourceType: InvoiceSourceType.event_venue_transaction,
        sourceId: tx.id
      });
    });

    // 3. Map Gear Transactions
    event.assetTransactions.forEach(tx => {
      items.push({
        amount: tx.agreedPrice,
        description: `Gear Rental: ${tx.id}`,
        sourceType: InvoiceSourceType.event_asset_transaction,
        sourceId: tx.id
      });
    });

    // 4. Map Talent Transactions
    event.serviceTransactions.forEach(tx => {
      items.push({
        amount: tx.agreedPrice,
        description: `Talent Service: ${tx.id}`,
        sourceType: InvoiceSourceType.event_service_transaction,
        sourceId: tx.id
      });
    });

    if (items.length === 0) {
      throw new Error("No payable transactions found for this event.");
    }

    // 5. Build Pricing Context
    const pricingContext = {
      transactionType: "event",
      // `Event` has no `type` field — `eventCategory` is the enum that
      // carries this (corporate/birthday/wedding/social/other), and it's
      // required, so there's nothing to fall back from.
      category: event.eventCategory,
      voucherCode,
    };

    // 6. Create Invoice
    const invoice = await InvoiceSvc.createInvoice({
      payerId,
      pricingContext,
      items,
      dueDate: event.startAt // Payment due by event start
    });

    // 7. Create Checkout Session
    const checkout = await CheckoutSvc.createCheckout(invoice.id);

    return { ...checkout, invoice };
  }
}
