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
    payload: any,
    processor: () => Promise<void>
  ) {
    // 1. Create or retrieve the event record
    const eventRecord = await prisma.paymentProviderEvent.upsert({
      where: {
        provider_providerEventId: {
          provider,
          providerEventId
        }
      },
      update: {},
      create: {
        provider,
        providerEventId,
        eventType,
        payload
      }
    });

    // 2. Check if already processed
    if (eventRecord.processed) {
      console.log(`[WebhookSvc] Event ${providerEventId} already processed. Skipping.`);
      return;
    }

    // 3. Process business logic
    await processor();

    // 4. Mark as processed
    await prisma.paymentProviderEvent.update({
      where: { id: eventRecord.id },
      data: {
        processed: true,
        processedAt: new Date()
      }
    });
  }

  /**
   * Synchronizes Invoice and Checkout status based on a successful payment intent.
   */
  static async handlePaymentSuccess(providerSessionId: string, providerReference: string, amountPaid: number, currency: string) {
    const invoiceId = await prisma.$transaction(async (tx) => {
      // 1. Find the active checkout
      const checkout = await tx.checkout.findUnique({
        where: { providerSessionId }
      });
      if (!checkout) throw new Error("Checkout not found for session " + providerSessionId);

      // 2. Mark checkout as completed
      await tx.checkout.update({
        where: { id: checkout.id },
        data: { status: "completed" }
      });

      // 3. Create or update the Payment record
      const payment = await tx.payment.upsert({
        where: { providerReference },
        update: {
          status: "paid",
          paidAt: new Date()
        },
        create: {
          invoiceId: checkout.invoiceId,
          amount: amountPaid,
          method: "card", // Simplified for V1
          provider: checkout.provider,
          providerReference,
          status: "paid",
          paidAt: new Date()
        }
      });

      // 4. Update the Invoice status
      const invoice = await tx.invoice.update({
        where: { id: checkout.invoiceId },
        data: { status: "paid" }
      });

      // 5. Confirm Voucher Redemption if a discount was applied
      if (invoice.discountAmount.toNumber() > 0 && invoice.discountSnapshot) {
        const snapshot = invoice.discountSnapshot as any;
        if (snapshot.voucherId) {
          // Verify if it hasn't been redeemed yet (should be unique per invoice)
          const existingRedemption = await tx.voucherRedemption.findUnique({
            where: { invoiceId: invoice.id }
          });
          
          if (!existingRedemption) {
            await tx.voucherRedemption.create({
              data: {
                voucherId: snapshot.voucherId,
                userId: invoice.payerId,
                invoiceId: invoice.id,
                discountAmount: invoice.discountAmount,
                redeemedAt: new Date()
              }
            });
          }
        }
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
   * Handles payment failure. Updates Checkout and Payment, but leaves Invoice intact for retry.
   */
  static async handlePaymentFailure(providerSessionId: string, providerReference: string) {
    await prisma.$transaction(async (tx) => {
      const checkout = await tx.checkout.findUnique({
        where: { providerSessionId }
      });
      if (!checkout) return; // Silent return if not found

      await tx.checkout.update({
        where: { id: checkout.id },
        data: { status: "failed" }
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
            status: "failed"
          }
        });
      }
    });
  }
}
