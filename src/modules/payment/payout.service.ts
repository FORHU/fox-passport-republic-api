import { prisma } from "../../utils/prisma";
import { PayoutSourceType } from "@prisma/client";
import PayoutSvc from "../payout/payout.service";

export default class PaymentPayoutSvc {
  /**
   * Distributes funds for a paid invoice to the respective providers.
   * Calculates the gateway fee and platform fee allocations, then fires the
   * actual Stripe transfer for each one (reusing `payout/payout.service.ts`'s
   * `fireTransfer` — the two payout services differ in how they *compute* a
   * payout, not in how they *pay it out*).
   */
  static async allocatePayouts(invoiceId: string) {
    const payoutIds = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true, payments: { where: { status: "paid" } } }
      });

      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status !== "paid") throw new Error("Cannot allocate a non-paid invoice");

      // Fast-path guard — the per-item upsert below is the real idempotency
      // guarantee (matches payout/payout.service.ts's @@unique([sourceType,
      // sourceId, providerId])), this just avoids the query loop entirely on
      // a retried webhook once allocation has already happened once.
      const sourceIds = invoice.items.map(i => i.sourceId);
      const existingPayouts = await tx.payout.count({ where: { sourceId: { in: sourceIds } } });
      if (existingPayouts > 0) return [];

      // We assume one primary successful payment for this invoice for fee calculations
      const payment = invoice.payments[0];
      if (!payment) throw new Error("No successful payment found for paid invoice");

      // In V1, we split the platform fee across the line items proportionally.
      // Business Rule: FoxPassport absorbs promotional discounts by default,
      // so we do not subtract the discount from the provider's payout.
      const subtotalNum = invoice.subtotalAmount.toNumber();
      const platformFeeNum = invoice.platformFeeAmount.toNumber();

      const ids: string[] = [];

      for (const item of invoice.items) {
        const itemAmount = item.amount.toNumber();
        if (itemAmount <= 0) continue;

        // Proportional logic
        const itemRatio = itemAmount / subtotalNum;
        const itemPlatformFee = platformFeeNum * itemRatio;

        // Mock Gateway Fee for Stripe (e.g., 2.9% + $0.30/Php15)
        const gatewayFee = (itemAmount * 0.029) + (15 * itemRatio);

        const payoutAmount = itemAmount - itemPlatformFee - gatewayFee;

        // Find recipient ID based on source type. `sourceType` can also be
        // `booking` or `partner_investment` (InvoiceSourceType, not
        // PayoutSourceType) — those aren't payable here and fall through to
        // the `!recipientId` skip below.
        let recipientId = "";
        let payoutSourceType: PayoutSourceType | null = null;

        switch (item.sourceType) {
          case PayoutSourceType.event_venue_transaction: {
            const venueTx = await tx.eventVenueTransaction.findUnique({ where: { id: item.sourceId } });
            if (venueTx) recipientId = venueTx.providerId;
            payoutSourceType = PayoutSourceType.event_venue_transaction;
            break;
          }
          case PayoutSourceType.event_asset_transaction: {
            const assetTx = await tx.eventAssetTransaction.findUnique({ where: { id: item.sourceId } });
            if (assetTx) recipientId = assetTx.providerId;
            payoutSourceType = PayoutSourceType.event_asset_transaction;
            break;
          }
          case PayoutSourceType.event_service_transaction: {
            const serviceTx = await tx.eventServiceTransaction.findUnique({ where: { id: item.sourceId } });
            if (serviceTx) recipientId = serviceTx.providerId;
            payoutSourceType = PayoutSourceType.event_service_transaction;
            break;
          }
          case PayoutSourceType.sponsorship: {
            const sponsorship = await tx.partnershipProposal.findUnique({ where: { id: item.sourceId }, include: { targetEvent: true, targetVenue: true } });
            if (sponsorship?.targetEvent) {
              recipientId = sponsorship.targetEvent.organizerId;
            } else if (sponsorship?.targetVenue) {
              recipientId = sponsorship.targetVenue.mayorId;
            }
            payoutSourceType = PayoutSourceType.sponsorship;
            break;
          }
        }

        if (!recipientId || !payoutSourceType) continue; // Unable to resolve recipient

        // Idempotency guard: the @@unique([sourceType, sourceId, providerId])
        // constraint means calling this twice for the same provider/source
        // is a no-op the second time, so a retried webhook never double-pays.
        const payout = await tx.payout.upsert({
          where: {
            sourceType_sourceId_providerId: {
              sourceType: payoutSourceType,
              sourceId: item.sourceId,
              providerId: recipientId,
            },
          },
          create: {
            providerId: recipientId,
            sourceType: payoutSourceType,
            sourceId: item.sourceId,
            allocationAmount: itemAmount,
            platformFeeAmount: itemPlatformFee,
            gatewayFeeAmount: gatewayFee,
            payoutAmount: payoutAmount,
          },
          update: {}, // already exists — no-op, this is the idempotency guard
        });
        ids.push(payout.id);
      }

      return ids;
    });

    // Fire transfers outside the transaction — Stripe calls shouldn't hold a
    // DB transaction open, and fireTransfer never throws (it records failure
    // on the row instead), so a partial failure here doesn't need a retry of
    // allocation itself.
    for (const id of payoutIds) {
      await PayoutSvc.fireTransfer(id);
    }
  }
}
