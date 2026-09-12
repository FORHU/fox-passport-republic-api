import { prisma } from '../../utils/prisma';
import { PartnershipProposal, PartnershipProposalStatus, PartnershipType } from '@prisma/client';
import { AuthenticatedUser } from '../../types/auth';

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
  static async createProposal(
    partnerId: string,
    data: CreateProposalDto
  ): Promise<PartnershipProposal> {
    const hasEvent = !!data.targetEventId;
    const hasVenue = !!data.targetVenueId;

    if (!(hasEvent !== hasVenue)) {
      throw new Error('A Partnership Proposal must target exactly one Event or Venue.');
    }

    if (hasEvent) {
      const event = await prisma.event.findUnique({ where: { id: data.targetEventId! } });
      if (!event) throw new Error('Target Event not found.');
    } else {
      const venue = await prisma.venue.findUnique({ where: { id: data.targetVenueId! } });
      if (!venue) throw new Error('Target Venue not found.');
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

  static async getProposal(id: string): Promise<PartnershipProposal> {
    const proposal = await prisma.partnershipProposal.findUnique({
      where: { id },
      include: { targetEvent: true, targetVenue: true },
    });
    if (!proposal) throw new Error('Proposal not found');
    return proposal;
  }

  static async listProposals(params: {
    partnerId?: string;
    targetEventId?: string;
    targetVenueId?: string;
  }): Promise<PartnershipProposal[]> {
    return prisma.partnershipProposal.findMany({
      where: params,
      orderBy: { createdAt: 'desc' },
    });
  }

  static async acceptProposal(
    id: string,
    caller: AuthenticatedUser
  ): Promise<PartnershipProposal> {
    return prisma.$transaction(async (tx) => {
      const proposal = await tx.partnershipProposal.findUnique({
        where: { id },
      });

      if (!proposal) throw new Error('Proposal not found.');
      if (proposal.status !== PartnershipProposalStatus.pending) {
        throw new Error(`Cannot accept a proposal that is ${proposal.status}.`);
      }

      if (proposal.partnerId === caller.userId) {
        throw new Error('A Partner cannot accept their own proposal.');
      }

      // Verify ownership
      if (proposal.targetEventId) {
        const event = await tx.event.findUnique({ where: { id: proposal.targetEventId } });
        if (!event || event.organizerId !== caller.userId) {
          throw new Error('Unauthorized: Only the Event organizer can accept this proposal.');
        }
      } else if (proposal.targetVenueId) {
        const venue = await tx.venue.findUnique({ where: { id: proposal.targetVenueId } });
        // Checking VenueFoxer rights
        if (!venue || venue.mayorId !== caller.userId) {
          throw new Error('Unauthorized: Only the Venue owner can accept this proposal.');
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
            type: 'financial_capital',
            title: `Investment: ${proposal.title}`,
            description: proposal.description,
            monetaryValue: proposal.proposedAmount || 0,
            targetEventId: proposal.targetEventId,
            targetVenueId: proposal.targetVenueId,
            status: 'active',
          },
        });
      }

      return updatedProposal;
    });
  }

  static async rejectProposal(
    id: string,
    caller: AuthenticatedUser
  ): Promise<PartnershipProposal> {
    const proposal = await prisma.partnershipProposal.findUnique({ where: { id } });
    if (!proposal) throw new Error('Proposal not found.');

    if (proposal.status !== PartnershipProposalStatus.pending) {
      throw new Error(`Cannot reject a proposal that is ${proposal.status}.`);
    }

    if (proposal.targetEventId) {
      const event = await prisma.event.findUnique({ where: { id: proposal.targetEventId } });
      if (!event || event.organizerId !== caller.userId) {
        throw new Error('Unauthorized: Only the Event organizer can reject this proposal.');
      }
    } else if (proposal.targetVenueId) {
      const venue = await prisma.venue.findUnique({ where: { id: proposal.targetVenueId } });
      if (!venue || venue.mayorId !== caller.userId) {
        throw new Error('Unauthorized: Only the Venue owner can reject this proposal.');
      }
    }

    return prisma.partnershipProposal.update({
      where: { id },
      data: { status: PartnershipProposalStatus.rejected },
    });
  }

  static async withdrawProposal(
    id: string,
    partnerId: string
  ): Promise<PartnershipProposal> {
    const proposal = await prisma.partnershipProposal.findUnique({ where: { id } });
    if (!proposal) throw new Error('Proposal not found.');

    if (proposal.partnerId !== partnerId) {
      throw new Error('Unauthorized: Only the proposing Partner can withdraw this proposal.');
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
