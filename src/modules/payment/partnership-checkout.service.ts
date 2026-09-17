import Stripe from "stripe";
import { prisma } from "../../utils/prisma";
import InvoiceSvc from "./invoice.service";
import CheckoutSvc from "./checkout.service";
import PromotionSvc from "../promotion/promotion.service";
import PayoutSvc from "../payout/payout.service";
import NotificationService from "../notifications/user-notification.service";
import { STRIPE_SECRET_KEY } from "../../config";
import { toStripeCents, formatCurrency } from "../../utils/pricing";
import {
  InvoiceSourceType,
  PartnershipType,
  RefundStatus,
} from "@prisma/client";

const REUSABLE_STATUSES = ["pending", "processing"] as const;

const stripe = new Stripe(STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

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

  /**
   * Cancels a paid sponsorship and refunds it in full — there's no
   * cancellation-policy concept for a sponsorship the way there is for a
   * timed rental (no per-provider tiers to prorate against), so this is a
   * simpler binary than `EventCheckoutSvc.cancelEvent`: either it's still
   * cancellable and gets refunded 100%, or it isn't.
   *
   * Cancellable up until the sponsored event starts, if this sponsorship
   * targets one — a venue-only sponsorship (no `targetEvent`) has no
   * natural cutoff, so it stays cancellable.
   */
  static async cancelSponsorship(proposalId: string, requesterId: string) {
    const proposal = await prisma.partnershipProposal.findUnique({
      where: { id: proposalId },
      include: { targetEvent: true },
    });
    if (!proposal) throw new Error("Partnership Proposal not found");
    if (proposal.partnerId !== requesterId) {
      throw new Error(
        "Unauthorized: only the sponsoring partner may cancel this",
      );
    }
    if (
      proposal.targetEvent &&
      proposal.targetEvent.startAt.getTime() <= Date.now()
    ) {
      throw new Error(
        "The sponsored event has already started — cancellation is no longer allowed",
      );
    }

    const invoice = await InvoiceSvc.findInvoiceForSource(
      InvoiceSourceType.sponsorship,
      proposalId,
    );
    if (
      invoice?.status === "refunded" ||
      invoice?.status === "partially_refunded"
    ) {
      throw new Error("This sponsorship has already been refunded.");
    }
    if (!invoice || invoice.status !== "paid") {
      if (invoice && invoice.status === "pending") {
        await InvoiceSvc.cancelInvoice(invoice.id);
      }
      return { refund: null };
    }

    const fullInvoice = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: { items: true, payments: { where: { status: "paid" } } },
    });
    const payment = fullInvoice?.payments[0];
    const invoiceItem = fullInvoice?.items[0];
    if (!fullInvoice || !payment || !invoiceItem) {
      throw new Error(
        "No successful payment found for this sponsorship's invoice.",
      );
    }

    let stripeRefundId: string | null = null;
    let status: RefundStatus = RefundStatus.succeeded;
    try {
      const sr = await stripe.refunds.create({
        payment_intent: payment.providerReference!,
        amount: toStripeCents(invoiceItem.amount.toNumber()),
      });
      status =
        sr.status === "succeeded"
          ? RefundStatus.succeeded
          : sr.status === "failed"
            ? RefundStatus.failed
            : RefundStatus.pending;
      stripeRefundId = sr.id;
    } catch (e: unknown) {
      const err = e as Error;
      status = RefundStatus.failed;
      console.error(
        `Sponsorship cancellation refund failed for proposal ${proposalId}: ${err.message}`,
      );
    }

    const refund = await prisma.refund.create({
      data: {
        paymentId: payment.id,
        invoiceItemId: invoiceItem.id,
        amount: invoiceItem.amount,
        providerReference: stripeRefundId,
        status,
        reason: "Sponsorship cancelled by partner",
      },
    });

    await PayoutSvc.reversePayoutForSource(
      proposalId,
      invoiceItem.amount,
    ).catch((e) =>
      console.error(`Payout reversal failed for sponsorship ${proposalId}`, e),
    );

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status:
          status === RefundStatus.succeeded ? "refunded" : "partially_refunded",
      },
    });

    // Sponsorship checkout can carry a voucher like any other Invoice
    // (see `createSponsorshipCheckout`'s `voucherCode`) — release it the
    // same way EventCheckoutSvc.cancelEvent does.
    await PromotionSvc.releaseInvoiceRedemptions(invoice.id).catch((e) =>
      console.error(
        `Failed to release voucher redemptions for invoice ${invoice.id} (sponsorship ${proposalId})`,
        e,
      ),
    );

    NotificationService.create({
      userId: requesterId,
      type: "sponsorship_cancelled",
      title: "Sponsorship cancelled",
      message: `${proposal.title} was cancelled. ${formatCurrency(refund.amount.toNumber())} is being refunded.`,
      metadata: { link: `/partnerships/${proposalId}` },
    }).catch((e) =>
      console.error(
        "Failed to create sponsorship-cancellation notification",
        e,
      ),
    );

    return { refund };
  }
}
