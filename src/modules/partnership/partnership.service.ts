import { prisma } from "../../utils/prisma";
import {
  PartnershipProposal,
  PartnershipProposalStatus,
  PartnershipType,
  InvoiceSourceType,
  Event,
  Venue,
} from "@prisma/client";
import { AuthenticatedUser } from "../../types/auth";
import InvoiceSvc from "../payment/invoice.service";

export interface ProposalPayment {
  required: boolean;
  invoiceId?: string | null;
  status?: string;
}

type ProposalWithRelations = PartnershipProposal & {
  targetEvent?: Event | null;
  targetVenue?: Venue | null;
};

export type ProposalWithPayment = PartnershipProposal & {
  payment: ProposalPayment;
  canAccept: boolean;
  canReject: boolean;
  canWithdraw: boolean;
};

export interface CreateProposalDto {
  targetEventId?: string;
  targetVenueId?: string;
  partnershipType: PartnershipType;
  title: string;
  description: string;
  proposedAmount?: number;
  proposedContribution?: string;
  proposedBenefits?: string;
}

export class PartnershipSvc {
  /**
   * The computed `payment` sub-object every proposal read attaches — reused
   * by `getProposal` and `listProposals` so "is this payable, and what's it
   * cost" is derived in one place. `required` is true only for an accepted
   * sponsorship, the one type this checkout flow actually handles (see
   * `PartnershipCheckoutSvc`); investment/resource_contribution/
   * business_partnership stay `required: false` until a payable transaction
   * is explicitly modeled for them. `invoiceId`/`status` are only present
   * once a checkout has actually been initiated — a proposal that's
   * payable but hasn't been paid-for-yet has nothing to report beyond that.
   */
  private static async attachPayment(
    proposal: PartnershipProposal,
  ): Promise<PartnershipProposal & { payment: ProposalPayment }> {
    const required =
      proposal.partnershipType === PartnershipType.sponsorship &&
      proposal.status === PartnershipProposalStatus.accepted;

    if (!required) {
      return { ...proposal, payment: { required: false } };
    }

    const invoice = await InvoiceSvc.findInvoiceForSource(
      InvoiceSourceType.sponsorship,
      proposal.id,
    );

    return {
      ...proposal,
      payment: invoice
        ? { required: true, invoiceId: invoice.id, status: invoice.status }
        : // `invoiceId` explicit `null` rather than omitted — a consumer can
          // rely on the key always being present once `required` is true,
          // rather than branching on whether it exists at all.
          { required: true, invoiceId: null, status: "pending" },
    };
  }

  // Computed server-side, per viewer, the same way BookingEditRequestSvc's
  // canApprove/canDecline/canWithdraw are — never left as client-trusted
  // optional fields. The pre-existing bug this replaces: the frontend's
  // ProposalActions.tsx has always gated its Accept/Reject/Withdraw buttons
  // on these exact field names, but nothing here ever set them, so `payment
  // required` aside, those buttons have never rendered for anyone.
  private static computeActions(
    proposal: ProposalWithRelations,
    viewerId?: string,
  ): { canAccept: boolean; canReject: boolean; canWithdraw: boolean } {
    const isPending = proposal.status === PartnershipProposalStatus.pending;
    const ownerId =
      proposal.targetEvent?.organizerId ??
      proposal.targetVenue?.mayorId ??
      null;
    // Mirrors acceptProposal's own "a Partner cannot accept their own
    // proposal" guard, in case a proposal ever targets something the
    // proposing partner also owns.
    const isOwner =
      !!viewerId &&
      !!ownerId &&
      viewerId === ownerId &&
      viewerId !== proposal.partnerId;

    return {
      canAccept: isPending && isOwner,
      canReject: isPending && isOwner,
      canWithdraw: isPending && !!viewerId && viewerId === proposal.partnerId,
    };
  }

  private static async attachViewerFields(
    proposal: ProposalWithRelations,
    viewerId?: string,
  ): Promise<ProposalWithPayment> {
    const withPayment = await this.attachPayment(proposal);
    return { ...withPayment, ...this.computeActions(proposal, viewerId) };
  }

  static async createProposal(
    partnerId: string,
    data: CreateProposalDto,
  ): Promise<PartnershipProposal> {
    const hasEvent = !!data.targetEventId;
    const hasVenue = !!data.targetVenueId;

    if (!(hasEvent !== hasVenue)) {
      throw new Error(
        "A Partnership Proposal must target exactly one Event or Venue.",
      );
    }

    if (hasEvent) {
      const event = await prisma.event.findUnique({
        where: { id: data.targetEventId! },
      });
      if (!event) throw new Error("Target Event not found.");
    } else {
      const venue = await prisma.venue.findUnique({
        where: { id: data.targetVenueId! },
      });
      if (!venue) throw new Error("Target Venue not found.");
    }

    return prisma.partnershipProposal.create({
      data: {
        partnerId,
        targetEventId: data.targetEventId,
        targetVenueId: data.targetVenueId,
        partnershipType: data.partnershipType,
        title: data.title,
        description: data.description,
        proposedAmount: data.proposedAmount,
        proposedContribution: data.proposedContribution,
        proposedBenefits: data.proposedBenefits,
      },
    });
  }

  static async getProposal(
    id: string,
    viewerId?: string,
  ): Promise<ProposalWithPayment> {
    const proposal = await prisma.partnershipProposal.findUnique({
      where: { id },
      include: { targetEvent: true, targetVenue: true },
    });
    if (!proposal) throw new Error("Proposal not found");
    return this.attachViewerFields(proposal, viewerId);
  }

  static async listProposals(
    params: {
      partnerId?: string;
      targetEventId?: string;
      targetVenueId?: string;
    },
    viewerId?: string,
  ): Promise<ProposalWithPayment[]> {
    const proposals = await prisma.partnershipProposal.findMany({
      where: params,
      orderBy: { createdAt: "desc" },
      include: { targetEvent: true, targetVenue: true },
    });
    return Promise.all(
      proposals.map((p) => this.attachViewerFields(p, viewerId)),
    );
  }

  static async acceptProposal(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PartnershipProposal> {
    return prisma.$transaction(async (tx) => {
      const proposal = await tx.partnershipProposal.findUnique({
        where: { id },
      });

      if (!proposal) throw new Error("Proposal not found.");
      if (proposal.status !== PartnershipProposalStatus.pending) {
        throw new Error(`Cannot accept a proposal that is ${proposal.status}.`);
      }

      if (proposal.partnerId === caller.userId) {
        throw new Error("A Partner cannot accept their own proposal.");
      }

      // Verify ownership
      if (proposal.targetEventId) {
        const event = await tx.event.findUnique({
          where: { id: proposal.targetEventId },
        });
        if (!event || event.organizerId !== caller.userId) {
          throw new Error(
            "Unauthorized: Only the Event organizer can accept this proposal.",
          );
        }
      } else if (proposal.targetVenueId) {
        const venue = await tx.venue.findUnique({
          where: { id: proposal.targetVenueId },
        });
        // Checking VenueFoxer rights
        if (!venue || venue.mayorId !== caller.userId) {
          throw new Error(
            "Unauthorized: Only the Venue owner can accept this proposal.",
          );
        }
      }

      const updatedProposal = await tx.partnershipProposal.update({
        where: { id },
        data: { status: PartnershipProposalStatus.accepted },
      });

      // If it's an investment, create PartnerInvestment record conditionally
      if (proposal.partnershipType === PartnershipType.investment) {
        await tx.partnerInvestment.create({
          data: {
            partnerId: proposal.partnerId,
            type: "financial_capital",
            title: `Investment: ${proposal.title}`,
            description: proposal.description,
            monetaryValue: proposal.proposedAmount || 0,
            targetEventId: proposal.targetEventId,
            targetVenueId: proposal.targetVenueId,
            status: "active",
          },
        });
      }

      return updatedProposal;
    });
  }

  static async rejectProposal(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<PartnershipProposal> {
    const proposal = await prisma.partnershipProposal.findUnique({
      where: { id },
    });
    if (!proposal) throw new Error("Proposal not found.");

    if (proposal.status !== PartnershipProposalStatus.pending) {
      throw new Error(`Cannot reject a proposal that is ${proposal.status}.`);
    }

    if (proposal.targetEventId) {
      const event = await prisma.event.findUnique({
        where: { id: proposal.targetEventId },
      });
      if (!event || event.organizerId !== caller.userId) {
        throw new Error(
          "Unauthorized: Only the Event organizer can reject this proposal.",
        );
      }
    } else if (proposal.targetVenueId) {
      const venue = await prisma.venue.findUnique({
        where: { id: proposal.targetVenueId },
      });
      if (!venue || venue.mayorId !== caller.userId) {
        throw new Error(
          "Unauthorized: Only the Venue owner can reject this proposal.",
        );
      }
    }

    return prisma.partnershipProposal.update({
      where: { id },
      data: { status: PartnershipProposalStatus.rejected },
    });
  }

  static async withdrawProposal(
    id: string,
    partnerId: string,
  ): Promise<PartnershipProposal> {
    const proposal = await prisma.partnershipProposal.findUnique({
      where: { id },
    });
    if (!proposal) throw new Error("Proposal not found.");

    if (proposal.partnerId !== partnerId) {
      throw new Error(
        "Unauthorized: Only the proposing Partner can withdraw this proposal.",
      );
    }

    if (proposal.status !== PartnershipProposalStatus.pending) {
      throw new Error(`Cannot withdraw a proposal that is ${proposal.status}.`);
    }

    return prisma.partnershipProposal.update({
      where: { id },
      data: { status: PartnershipProposalStatus.withdrawn },
    });
  }
}
