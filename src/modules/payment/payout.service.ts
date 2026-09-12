import { prisma } from "../../utils/prisma";
import { Prisma } from "@prisma/client";
type Decimal = Prisma.Decimal;

export default class PayoutSvc {
  /**
   * Distributes funds for a paid invoice to the respective providers.
   * Calculates the gateway fee and platform fee allocations.
   */
  static async allocatePayouts(invoiceId: string) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true, payments: { where: { status: "paid" } } }
      });

      if (!invoice) throw new Error("Invoice not found");
      if (invoice.status !== "paid") throw new Error("Cannot allocate a non-paid invoice");

      // Verify we haven't already created payouts
      const sourceIds = invoice.items.map(i => i.sourceId);
      const existingPayouts = await tx.payout.count({ where: { sourceId: { in: sourceIds } } });
      if (existingPayouts > 0) return; // Already allocated

      // We assume one primary successful payment for this invoice for fee calculations
      const payment = invoice.payments[0];
      if (!payment) throw new Error("No successful payment found for paid invoice");

      // In V1, we split the platform fee across the line items proportionally.
      // Business Rule: FoxPassport absorbs promotional discounts by default,
      // so we do not subtract the discount from the provider's payout.
      const subtotalNum = invoice.subtotalAmount.toNumber();
      const platformFeeNum = invoice.platformFeeAmount.toNumber();

      for (const item of invoice.items) {
        const itemAmount = item.amount.toNumber();
        if (itemAmount <= 0) continue;

        // Proportional logic
        const itemRatio = itemAmount / subtotalNum;
        const itemPlatformFee = platformFeeNum * itemRatio;
        
        // Mock Gateway Fee for Stripe (e.g., 2.9% + $0.30/Php15)
        const gatewayFee = (itemAmount * 0.029) + (15 * itemRatio);

        const payoutAmount = itemAmount - itemPlatformFee - gatewayFee;

        // Find recipient ID based on source type
        let recipientId = "";
        
        switch (item.sourceType) {
          case "event_venue_transaction":
            const venueTx = await tx.eventVenueTransaction.findUnique({ where: { id: item.sourceId } });
            if (venueTx) recipientId = venueTx.providerId;
            break;
          case "event_asset_transaction":
            const assetTx = await tx.eventAssetTransaction.findUnique({ where: { id: item.sourceId } });
            if (assetTx) recipientId = assetTx.providerId;
            break;
          case "event_service_transaction":
            const serviceTx = await tx.eventServiceTransaction.findUnique({ where: { id: item.sourceId } });
            if (serviceTx) recipientId = serviceTx.providerId;
            break;
          case "sponsorship":
            const sponsorship = await tx.partnershipProposal.findUnique({ where: { id: item.sourceId }, include: { targetEvent: true, targetVenue: true } });
            if (sponsorship?.targetEvent) {
              recipientId = sponsorship.targetEvent.organizerId;
            } else if (sponsorship?.targetVenue) {
              recipientId = sponsorship.targetVenue.mayorId;
            }
            break;
        }

        if (!recipientId) continue; // Unable to resolve recipient

        await tx.payout.create({
          data: {
            providerId: recipientId,
            sourceType: item.sourceType as any,
            sourceId: item.sourceId,
            status: "pending", // Waiting for Stripe Connect transfer
            allocationAmount: itemAmount,
            platformFeeAmount: itemPlatformFee,
            gatewayFeeAmount: gatewayFee,
            payoutAmount: payoutAmount,
            providerReference: null
          }
        });
      }
    });
  }
}
