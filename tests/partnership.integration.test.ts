import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/utils/prisma';
import { PartnershipSvc } from '../src/modules/partnership/partnership.service';
import { PartnershipProposalStatus, PartnershipType } from '@prisma/client';
import { AuthenticatedUser } from '../src/types/auth';

describe('Partnership Integration Tests', () => {
  let partnerUser: any;
  let regularUser: any;
  let eventOwner: any;
  let venueOwner: any;
  let targetEvent: any;
  let targetVenue: any;

  let partnerAuth: AuthenticatedUser;
  let regularAuth: AuthenticatedUser;
  let eventOwnerAuth: AuthenticatedUser;
  let venueOwnerAuth: AuthenticatedUser;

  beforeAll(async () => {
    const runId = Math.random().toString(36).substring(7);

    partnerUser = await prisma.user.create({
      data: { email: `partner_${runId}@test.com`, username: `partner_${runId}`, password: 'pw', roleType: ['investor'], name: 'Partner' }
    });
    regularUser = await prisma.user.create({
      data: { email: `citizen_${runId}@test.com`, username: `citizen_${runId}`, password: 'pw', roleType: [], name: 'Citizen' }
    });
    eventOwner = await prisma.user.create({
      data: { email: `event_owner_${runId}@test.com`, username: `event_owner_${runId}`, password: 'pw', roleType: ['eventFoxer'], name: 'Event Foxer' }
    });
    venueOwner = await prisma.user.create({
      data: { email: `venue_owner_${runId}@test.com`, username: `venue_owner_${runId}`, password: 'pw', roleType: ['venueFoxer'], name: 'Venue Foxer' }
    });

    targetEvent = await prisma.event.create({
      data: { name: 'Test Event', clientId: eventOwner.id, organizerId: eventOwner.id, description: 'Desc', eventCategory: 'corporate', startAt: new Date(), endAt: new Date(Date.now() + 3600000), guestCount: 100, totalAmount: 0 }
    });
    
    targetVenue = await prisma.venue.create({
      data: { 
        name: 'Test Venue', 
        mayorId: venueOwner.id, 
        address: '123 Test', 
        city: 'Test City', 
        country: 'Test Country',
        description: 'Test Venue Desc',
        category: 'convention_center',
        capacity: 100,
        price: 1000,
        billingRate: 'hourly'
      }
    });

    partnerAuth = { userId: partnerUser.id, email: partnerUser.email, systemRole: 'user', roleType: ['investor'] };
    regularAuth = { userId: regularUser.id, email: regularUser.email, systemRole: 'user', roleType: [] };
    eventOwnerAuth = { userId: eventOwner.id, email: eventOwner.email, systemRole: 'user', roleType: ['eventFoxer'] };
    venueOwnerAuth = { userId: venueOwner.id, email: venueOwner.email, systemRole: 'user', roleType: ['venueFoxer'] };
  });

  afterAll(async () => {
    await prisma.partnershipProposal.deleteMany();
    await prisma.partnerInvestment.deleteMany();
    await prisma.event.deleteMany();
    await prisma.venue.deleteMany();
    await prisma.user.deleteMany();
  });

  describe('Authorization & Target Validation', () => {
    it('Proposal cannot target both Event and Venue', async () => {
      await expect(
        PartnershipSvc.createProposal(partnerUser.id, {
          targetEventId: targetEvent.id,
          targetVenueId: targetVenue.id,
          partnershipType: PartnershipType.sponsorship,
          title: 'Sponsorship',
          description: 'Sponsor both'
        })
      ).rejects.toThrow('A Partnership Proposal must target exactly one Event or Venue.');
    });

    it('Proposal cannot target neither Event nor Venue', async () => {
      await expect(
        PartnershipSvc.createProposal(partnerUser.id, {
          partnershipType: PartnershipType.investment,
          title: 'Investment',
          description: 'Invest nowhere'
        })
      ).rejects.toThrow('A Partnership Proposal must target exactly one Event or Venue.');
    });

    it('Partner cannot accept their own proposal', async () => {
      const proposal = await PartnershipSvc.createProposal(partnerUser.id, {
        targetEventId: targetEvent.id,
        partnershipType: PartnershipType.sponsorship,
        title: 'Sponsorship',
        description: 'Sponsor event'
      });

      await expect(
        PartnershipSvc.acceptProposal(proposal.id, partnerAuth)
      ).rejects.toThrow('A Partner cannot accept their own proposal.');
    });

    it('Unauthorized user cannot accept proposal', async () => {
      const proposal = await PartnershipSvc.createProposal(partnerUser.id, {
        targetVenueId: targetVenue.id,
        partnershipType: PartnershipType.sponsorship,
        title: 'Sponsorship',
        description: 'Sponsor venue'
      });

      await expect(
        PartnershipSvc.acceptProposal(proposal.id, regularAuth)
      ).rejects.toThrow('Unauthorized: Only the Venue owner can accept this proposal.');
    });
  });

  describe('Lifecycle', () => {
    it('Pending proposal can be accepted', async () => {
      const proposal = await PartnershipSvc.createProposal(partnerUser.id, {
        targetEventId: targetEvent.id,
        partnershipType: PartnershipType.business_partnership,
        title: 'Biz Partner',
        description: 'Business'
      });

      const accepted = await PartnershipSvc.acceptProposal(proposal.id, eventOwnerAuth);
      expect(accepted.status).toBe(PartnershipProposalStatus.accepted);
    });

    it('Accepted proposal cannot be accepted again', async () => {
      const proposal = await PartnershipSvc.createProposal(partnerUser.id, {
        targetEventId: targetEvent.id,
        partnershipType: PartnershipType.business_partnership,
        title: 'Biz Partner 2',
        description: 'Business 2'
      });

      await PartnershipSvc.acceptProposal(proposal.id, eventOwnerAuth);
      
      await expect(
        PartnershipSvc.acceptProposal(proposal.id, eventOwnerAuth)
      ).rejects.toThrow('Cannot accept a proposal that is accepted.');
    });

    it('Pending proposal can be rejected', async () => {
      const proposal = await PartnershipSvc.createProposal(partnerUser.id, {
        targetVenueId: targetVenue.id,
        partnershipType: PartnershipType.resource_contribution,
        title: 'Resource',
        description: 'Resource contribution'
      });

      const rejected = await PartnershipSvc.rejectProposal(proposal.id, venueOwnerAuth);
      expect(rejected.status).toBe(PartnershipProposalStatus.rejected);
      
      await expect(
        PartnershipSvc.acceptProposal(proposal.id, venueOwnerAuth)
      ).rejects.toThrow('Cannot accept a proposal that is rejected.');
    });

    it('Pending proposal can be withdrawn by partner', async () => {
      const proposal = await PartnershipSvc.createProposal(partnerUser.id, {
        targetEventId: targetEvent.id,
        partnershipType: PartnershipType.investment,
        title: 'Investment',
        description: 'Investment'
      });

      const withdrawn = await PartnershipSvc.withdrawProposal(proposal.id, partnerUser.id);
      expect(withdrawn.status).toBe(PartnershipProposalStatus.withdrawn);

      await expect(
        PartnershipSvc.acceptProposal(proposal.id, eventOwnerAuth)
      ).rejects.toThrow('Cannot accept a proposal that is withdrawn.');
    });
  });

  describe('Investment Conversion', () => {
    it('Accepted investment proposal creates PartnerInvestment', async () => {
      const proposal = await PartnershipSvc.createProposal(partnerUser.id, {
        targetEventId: targetEvent.id,
        partnershipType: PartnershipType.investment,
        title: 'Big Investment',
        description: 'Investing 100k',
        proposedAmount: 100000
      });

      await PartnershipSvc.acceptProposal(proposal.id, eventOwnerAuth);

      const investment = await prisma.partnerInvestment.findFirst({
        where: { title: 'Investment: Big Investment' }
      });
      expect(investment).toBeDefined();
      expect(investment?.partnerId).toBe(partnerUser.id);
      expect(Number(investment?.monetaryValue)).toBe(100000);
      expect(investment?.targetEventId).toBe(targetEvent.id);
    });

    it('Accepted sponsorship does NOT create PartnerInvestment', async () => {
      const proposal = await PartnershipSvc.createProposal(partnerUser.id, {
        targetEventId: targetEvent.id,
        partnershipType: PartnershipType.sponsorship,
        title: 'Big Sponsorship',
        description: 'Sponsoring 50k',
        proposedAmount: 50000
      });

      await PartnershipSvc.acceptProposal(proposal.id, eventOwnerAuth);

      const investment = await prisma.partnerInvestment.findFirst({
        where: { title: 'Investment: Big Sponsorship' }
      });
      expect(investment).toBeNull();
    });
  });
});
