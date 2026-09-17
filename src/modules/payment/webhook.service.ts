import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import PaymentPayoutSvc from "./payout.service";

export default class WebhookSvc {
  /**
   * Idempotent wrapper for processing payment provider webhooks.
   * Prevents processing the same event twice.
   */
  static async processEventWithIdempotency(
    provider: string,
    providerEventId: string,
    eventType: string,
    payload: Prisma.InputJsonValue,
    processor: () => Promise<void>,
  ) {
    // 1. Create or retrieve the event record
    const eventRecord = await prisma.paymentProviderEvent.upsert({
      where: {
        provider_providerEventId: {
          provider,
          providerEventId,
        },
      },
      update: {},
      create: {
        provider,
        providerEventId,
        eventType,
        payload,
      },
    });

    // 2. Check if already processed
    if (eventRecord.processed) {
      console.log(
        `[WebhookSvc] Event ${providerEventId} already processed. Skipping.`,
      );
      return;
    }

    // 3. Process business logic
    await processor();

    // 4. Mark as processed
    await prisma.paymentProviderEvent.update({
      where: { id: eventRecord.id },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Synchronizes Invoice and Checkout status based on a successful payment intent.
   */
  static async handlePaymentSuccess(
    providerSessionId: string,
    providerReference: string,
    amountPaid: number,
    _currency: string,
  ) {
    const invoiceId = await prisma.$transaction(async (tx) => {
      // 1. Find the active checkout
      const checkout = await tx.checkout.findUnique({
        where: { providerSessionId },
      });
      if (!checkout)
        throw new Error("Checkout not found for session " + providerSessionId);

      // 2. Mark checkout as completed
      await tx.checkout.update({
        where: { id: checkout.id },
        data: { status: "completed" },
      });

      // 3. Create or update the Payment record
      const _payment = await tx.payment.upsert({
        where: { providerReference },
        update: {
          status: "paid",
          paidAt: new Date(),
        },
        create: {
          invoiceId: checkout.invoiceId,
          amount: amountPaid,
          method: "card", // Simplified for V1
          provider: checkout.provider,
          providerReference,
          status: "paid",
          paidAt: new Date(),
        },
      });

      // 4. Update the Invoice status
      const invoice = await tx.invoice.update({
        where: { id: checkout.invoiceId },
        data: { status: "paid" },
        include: { items: true },
      });

      // 5. Confirm Voucher Redemption(s) if a discount was applied. Two
      // independent kinds, both only recorded now (payment actually
      // succeeded), never at invoice creation — an abandoned/cancelled
      // invoice must not consume a limited voucher's usage count:
      //
      //  - Blanket: a platform-wide code against the whole invoice.
      //    `invoice.discountAmount` is the *combined* total (blanket +
      //    every line item's own discount, see InvoiceSvc.createInvoice),
      //    so the blanket row's own amount must come from the snapshot,
      //    not that combined field, or the blanket voucher's analytics
      //    would double-count line-item discounts that aren't its own.
      //  - Per-item: a Foxer-owned code scoped to one line item in a
      //    multi-provider Event checkout (see InvoiceItem.discountAmount).
      const snapshot = invoice.discountSnapshot as {
        voucherId?: string;
        amount?: number;
      } | null;
      if (snapshot?.voucherId && (snapshot.amount ?? 0) > 0) {
        const existingBlanket = await tx.voucherRedemption.findFirst({
          where: { invoiceId: invoice.id, invoiceItemId: null },
        });
        if (!existingBlanket) {
          await tx.voucherRedemption.create({
            data: {
              voucherId: snapshot.voucherId,
              userId: invoice.payerId,
              invoiceId: invoice.id,
              discountAmount: snapshot.amount ?? 0,
              redeemedAt: new Date(),
            },
          });
        }
      }

      for (const item of invoice.items) {
        if (!item.voucherId || item.discountAmount.toNumber() <= 0) continue;

        const existingItemRedemption = await tx.voucherRedemption.findUnique({
          where: { invoiceItemId: item.id },
        });
        if (existingItemRedemption) continue;

        await tx.voucherRedemption.create({
          data: {
            voucherId: item.voucherId,
            userId: invoice.payerId,
            invoiceId: invoice.id,
            invoiceItemId: item.id,
            discountAmount: item.discountAmount,
            redeemedAt: new Date(),
          },
        });
      }

      // (Later: Emit a domain event or call business modules to transition their state based on Invoice paid)
      return checkout.invoiceId;
    });

    // Outside the transaction above — allocatePayouts opens (and fires
    // Stripe transfers outside) its own transaction, and re-reads the
    // invoice/payment rows the block above just committed.
    await PaymentPayoutSvc.allocatePayouts(invoiceId);
  }

  /**
   * A Checkout Session that timed out before the payer ever completed it —
   * `checkout.session.expired`, distinct from a failed payment attempt.
   * Nobody tried and failed; nobody tried at all. Marks the Checkout
   * `expired` (mirroring `CheckoutSvc.expireCheckout`'s own state, reached
   * here by session id rather than checkout id) and leaves the Invoice and
   * any Payment rows untouched — same reasoning as `handlePaymentFailure`,
   * the payer can still retry via a fresh checkout on the same invoice.
   */
  static async handleCheckoutExpired(providerSessionId: string) {
    const checkout = await prisma.checkout.findUnique({
      where: { providerSessionId },
    });
    if (!checkout) return; // Silent return if not found, matching handlePaymentFailure.
    if (checkout.status !== "active") return; // already resolved (paid/expired/failed) — nothing to do.

    await prisma.checkout.update({
      where: { id: checkout.id },
      data: { status: "expired" },
    });
  }

  /**
   * Handles payment failure. Updates Checkout and Payment, but leaves Invoice intact for retry.
   */
  static async handlePaymentFailure(
    providerSessionId: string,
    providerReference: string,
  ) {
    await prisma.$transaction(async (tx) => {
      const checkout = await tx.checkout.findUnique({
        where: { providerSessionId },
      });
      if (!checkout) return; // Silent return if not found

      await tx.checkout.update({
        where: { id: checkout.id },
        data: { status: "failed" },
      });

      if (providerReference) {
        await tx.payment.upsert({
          where: { providerReference },
          update: { status: "failed" },
          create: {
            invoiceId: checkout.invoiceId,
            amount: 0,
            method: "card",
            provider: checkout.provider,
            providerReference,
            status: "failed",
          },
        });
      }
    });
  }
}
