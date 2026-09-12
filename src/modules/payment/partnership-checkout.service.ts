import { prisma } from "../../utils/prisma";
import InvoiceSvc from "./invoice.service";
import CheckoutSvc from "./checkout.service";
import { InvoiceSourceType, PartnershipType } from "@prisma/client";

export default class PartnershipCheckoutSvc {
  /**
   * Generates a checkout session for an accepted Sponsorship Proposal.
   * Investments are deliberately excluded from marketplace fees and checkout here.
   */
  static async createSponsorshipCheckout(proposalId: string, payerId: string, voucherCode?: string) {
    const proposal = await prisma.partnershipProposal.findUnique({
      where: { id: proposalId },
      include: {
        targetEvent: true,
      }
    });

    if (!proposal) throw new Error("Partnership Proposal not found");
    if (proposal.status !== "accepted") throw new Error("Proposal must be accepted before payment");
    if (proposal.partnershipType !== PartnershipType.sponsorship) {
      throw new Error("Only sponsorship proposals can be processed through the standard checkout flow");
    }
    if (!proposal.proposedAmount) {
      throw new Error("Sponsorship proposal has no payable amount");
    }

    // 1. Build Pricing Context
    // We use "sponsorship" as the transaction type so specific rules can be defined for it
    const pricingContext = {
      transactionType: "sponsorship",
      category: proposal.targetEvent?.eventCategory, // inherit event category if applicable
      voucherCode,
    };

    // 2. Create Invoice
    const invoice = await InvoiceSvc.createInvoice({
      payerId,
      pricingContext,
      items: [
        {
          amount: proposal.proposedAmount,
          description: `Sponsorship for ${proposal.targetEventId ? 'Event' : 'Venue'}: ${proposal.id}`,
          sourceType: InvoiceSourceType.sponsorship,
          sourceId: proposal.id
        }
      ],
    });

    // 3. Create Checkout Session
    const checkout = await CheckoutSvc.createCheckout(invoice.id);

    return checkout;
  }
}
