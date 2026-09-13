import { prisma } from "../../utils/prisma";
import InvoiceSvc from "./invoice.service";
import CheckoutSvc from "./checkout.service";
import { InvoiceSourceType, PartnershipType } from "@prisma/client";

const REUSABLE_STATUSES = ["pending", "processing"] as const;

export default class PartnershipCheckoutSvc {
  /**
   * Generates a checkout session for an accepted Sponsorship Proposal.
   * Investments are deliberately excluded from marketplace fees and checkout here.
   *
   * Retry-safe in the same shape as `EventCheckoutSvc.createEventCheckout` —
   * reuses whatever invoice already exists for this proposal instead of
   * throwing on a double-click/retry.
   */
  static async createSponsorshipCheckout(
    proposalId: string,
    payerId: string,
    voucherCode?: string,
  ) {
    const proposal = await prisma.partnershipProposal.findUnique({
      where: { id: proposalId },
      include: {
        targetEvent: true,
      },
    });

    if (!proposal) throw new Error("Partnership Proposal not found");
    if (proposal.partnerId !== payerId) {
      throw new Error(
        "Unauthorized: only the proposing partner may pay this proposal",
      );
    }
    if (proposal.status !== "accepted")
      throw new Error("Proposal must be accepted before payment");
    if (proposal.partnershipType !== PartnershipType.sponsorship) {
      throw new Error(
        "Only sponsorship proposals can be processed through the standard checkout flow",
      );
    }
    if (!proposal.proposedAmount) {
      throw new Error("Sponsorship proposal has no payable amount");
    }

    // Same reasoning as EventCheckoutSvc.createEventCheckout: serialize
    // concurrent callers for this proposal so the second one waits for the
    // first's whole find-or-create flow to commit, rather than both racing
    // past InvoiceSvc.createInvoice's own (per-call) double-invoicing guard.
    return prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`partnership-checkout:${proposal.id}`}, 0))`;

        const existing = await InvoiceSvc.findInvoiceForSource(
          InvoiceSourceType.sponsorship,
          proposal.id,
        );
        if (existing) {
          if (existing.status === "paid") {
            throw new Error("This sponsorship has already been paid for.");
          }
          if (
            (REUSABLE_STATUSES as readonly string[]).includes(existing.status)
          ) {
            const checkout = await CheckoutSvc.createCheckout(existing.id);
            return { ...checkout, invoice: existing };
          }
          // cancelled/failed/refunded — not blocking, falls through to a fresh invoice below.
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
              amount: proposal.proposedAmount!,
              description: `Sponsorship for ${proposal.targetEventId ? "Event" : "Venue"}: ${proposal.id}`,
              sourceType: InvoiceSourceType.sponsorship,
              sourceId: proposal.id,
            },
          ],
        });

        // 3. Create Checkout Session
        const checkout = await CheckoutSvc.createCheckout(invoice.id);

        return { ...checkout, invoice };
      },
      { timeout: 15000 },
    );
  }
}
