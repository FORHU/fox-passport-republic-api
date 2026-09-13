import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { prisma } from '../src/utils/prisma';
import BiddingSvc from '../src/modules/bidding/bidding.service';

describe('Bidding Lifecycle Integration Tests', () => {
  let eventFoxerId: string;
  let talentFoxerId: string;
  let gearFoxerId: string;
  let unprivilegedUserId: string;

  let eventId: string;
  let templateId: string;
  let eventTemplateServiceId: string;
  let eventTemplateAssetId: string;

  let serviceId: string;
  let assetId: string;
  let deletedAssetId: string;

  beforeAll(async () => {
    const runId = Math.random().toString(36).substring(7);
    const eventEmail = `event_${runId}@test.com`;
    const talentEmail = `talent_${runId}@test.com`;
    const gearEmail = `gear_${runId}@test.com`;
    const noneEmail = `none_${runId}@test.com`;

    // Setup users
    const eventFoxer = await prisma.user.create({
      data: { email: eventEmail, username: `event_${runId}`, password: 'pw', roleType: ['eventFoxer'], name: 'Event Foxer' }
    });
    eventFoxerId = eventFoxer.id;

    const talentFoxer = await prisma.user.create({
      data: { email: talentEmail, username: `talent_${runId}`, password: 'pw', roleType: ['serviceFoxer'], name: 'Talent Foxer' }
    });
    talentFoxerId = talentFoxer.id;

    const gearFoxer = await prisma.user.create({
      data: { email: gearEmail, username: `gear_${runId}`, password: 'pw', roleType: ['gearFoxer'], name: 'Gear Foxer' }
    });
    gearFoxerId = gearFoxer.id;

    const unprivileged = await prisma.user.create({
      data: { email: noneEmail, username: `none_${runId}`, password: 'pw', roleType: [], name: 'Normal Citizen' }
    });
    unprivilegedUserId = unprivileged.id;

    // Setup Template & Requirements
    const template = await prisma.eventTemplate.create({
      data: {
        ownerId: eventFoxerId,
        name: 'Test Template',
        description: 'Test template description',
        category: 'corporate',
        templateServices: {
          create: [{ description: 'Test DJ Service' }]
        },
        templateAssets: {
          create: [{ description: 'Test Speakers', quantity: 4 }]
        }
      },
      include: { templateServices: true, templateAssets: true }
    });
    templateId = template.id;
    eventTemplateServiceId = template.templateServices[0].id;
    eventTemplateAssetId = template.templateAssets[0].id;

    // Setup Event
    const event = await prisma.event.create({
      data: {
        clientId: eventFoxerId,
        organizerId: eventFoxerId,
        templateId: templateId,
        name: 'Test Event',
        description: 'Test Event Description',
        eventCategory: 'corporate',
        startAt: new Date(),
        endAt: new Date(Date.now() + 86400000),
        guestCount: 100,
        totalAmount: 1000,
        eventStatus: 'pending'
      }
    });
    eventId = event.id;

    // Setup Assets and Services
    const service = await prisma.service.create({
      data: { ownerId: talentFoxerId, category: 'entertainment', name: 'DJ Talent', description: 'desc', price: 100, billingRate: 'hourly', status: 'available' }
    });
    serviceId = service.id;

    const asset = await prisma.asset.create({
      data: { ownerId: gearFoxerId, category: 'sound_system', name: 'Speakers', description: 'desc', price: 100, billingRate: 'daily', status: 'available' }
    });
    assetId = asset.id;

    const deletedAsset = await prisma.asset.create({
      data: { ownerId: gearFoxerId, category: 'sound_system', name: 'Broken Speakers', description: 'desc', price: 100, billingRate: 'daily', status: 'archived' }
    });
    deletedAssetId = deletedAsset.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.eventAssetTransaction.deleteMany({});
    await prisma.eventServiceTransaction.deleteMany({});
    await prisma.eventAssetBid.deleteMany({});
    await prisma.eventServiceBid.deleteMany({});
    await prisma.$executeRaw`TRUNCATE TABLE "bookings" CASCADE;`;
    await prisma.$executeRaw`TRUNCATE TABLE "assets" CASCADE;`;
    await prisma.$executeRaw`TRUNCATE TABLE "services" CASCADE;`;
    await prisma.event.deleteMany({});
    await prisma.eventTemplateAsset.deleteMany({});
    await prisma.eventTemplateService.deleteMany({});
    await prisma.eventTemplate.deleteMany({});
    await prisma.user.deleteMany({
      where: { id: { in: [eventFoxerId, talentFoxerId, gearFoxerId, unprivilegedUserId] } }
    });
  });

  beforeEach(async () => {
    // Clear bids and transactions before each test
    await prisma.eventAssetTransaction.deleteMany({});
    await prisma.eventServiceTransaction.deleteMany({});
    await prisma.eventAssetBid.deleteMany({});
    await prisma.eventServiceBid.deleteMany({});
  });

  it('Gear/Talent capability validation: prevents unauthorized users from bidding', async () => {
    await expect(BiddingSvc.submitServiceBid({
      eventId, eventTemplateServiceId, providerId: unprivilegedUserId, proposedServiceId: serviceId, proposedPrice: 100
    })).rejects.toThrow('Unauthorized: you must have the Talent Foxer capability');

    await expect(BiddingSvc.submitAssetBid({
      eventId, eventTemplateAssetId, providerId: unprivilegedUserId, proposedAssetId: assetId, proposedPrice: 100
    })).rejects.toThrow('Unauthorized: you must have the Gear Foxer capability');
  });

  it('Asset/Service ownership validation: prevents bidding with others items', async () => {
    await expect(BiddingSvc.submitServiceBid({
      eventId, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: assetId, proposedPrice: 100 // Using assetId for service lookup will fail or ownership mismatch
    })).rejects.toThrow();

    await expect(BiddingSvc.submitAssetBid({
      eventId, eventTemplateAssetId, providerId: gearFoxerId, proposedAssetId: serviceId, proposedPrice: 100
    })).rejects.toThrow();
  });

  it('Requirement-to-event validation: prevents cross-event bidding', async () => {
    const wrongEvent = await prisma.event.create({
      data: { clientId: eventFoxerId, organizerId: eventFoxerId, name: 'Wrong Event', description: 'desc', eventCategory: 'social', startAt: new Date(), endAt: new Date(), guestCount: 10, totalAmount: 0, eventStatus: 'pending' }
    });

    await expect(BiddingSvc.submitServiceBid({
      eventId: wrongEvent.id, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: serviceId, proposedPrice: 100
    })).rejects.toThrow("Requirement does not belong to this event's template");

    await prisma.event.delete({ where: { id: wrongEvent.id } });
  });

  it('Duplicate acceptance & already fulfilled prevention', async () => {
    const bid1 = await BiddingSvc.submitServiceBid({
      eventId, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: serviceId, proposedPrice: 100
    });
    const bid2 = await BiddingSvc.submitServiceBid({
      eventId, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: serviceId, proposedPrice: 120
    });

    await BiddingSvc.acceptServiceBid(bid1.id, eventFoxerId);
    
    // bid2 is automatically rejected by the first acceptance. 
    // To test the 'already fulfilled' rule specifically, we reset its status to pending to simulate a race condition.
    await prisma.eventServiceBid.update({ where: { id: bid2.id }, data: { status: 'pending' } });

    // Trying to accept bid 2 should fail because requirement is fulfilled
    await expect(BiddingSvc.acceptServiceBid(bid2.id, eventFoxerId)).rejects.toThrow('This requirement has already been fulfilled');
  });

  it('Automatic rejection of competing pending bids', async () => {
    const bid1 = await BiddingSvc.submitServiceBid({ eventId, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: serviceId, proposedPrice: 100 });
    const bid2 = await BiddingSvc.submitServiceBid({ eventId, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: serviceId, proposedPrice: 110 });
    const bid3 = await BiddingSvc.submitServiceBid({ eventId, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: serviceId, proposedPrice: 120 });

    await BiddingSvc.acceptServiceBid(bid2.id, eventFoxerId);

    const b1 = await prisma.eventServiceBid.findUnique({ where: { id: bid1.id } });
    const b2 = await prisma.eventServiceBid.findUnique({ where: { id: bid2.id } });
    const b3 = await prisma.eventServiceBid.findUnique({ where: { id: bid3.id } });

    expect(b2?.status).toBe('accepted');
    expect(b1?.status).toBe('rejected');
    expect(b3?.status).toBe('rejected');
  });

  it('Correct Transaction Creation', async () => {
    const bid = await BiddingSvc.submitAssetBid({
      eventId, eventTemplateAssetId, providerId: gearFoxerId, proposedAssetId: assetId, proposedPrice: 500, proposedQuantity: 4
    });

    const result = await BiddingSvc.acceptAssetBid(bid.id, eventFoxerId);
    expect(result.transactionId).toBeDefined();

    const tx = await prisma.eventAssetTransaction.findUnique({ where: { id: result.transactionId } });
    expect(tx).toBeDefined();
    expect(tx?.agreedPrice.toNumber()).toBe(500);
    expect(tx?.status).toBe('pending');
  });

  it('Manual rejection without transaction creation', async () => {
    const bid = await BiddingSvc.submitServiceBid({
      eventId, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: serviceId, proposedPrice: 100
    });

    await BiddingSvc.rejectServiceBid(bid.id, eventFoxerId);

    const updatedBid = await prisma.eventServiceBid.findUnique({ where: { id: bid.id } });
    expect(updatedBid?.status).toBe('rejected');

    const transactions = await prisma.eventServiceTransaction.count();
    expect(transactions).toBe(0);
  });

  it('Provider cannot accept or reject their own bid', async () => {
    const bid = await BiddingSvc.submitServiceBid({
      eventId, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: serviceId, proposedPrice: 100
    });

    await expect(BiddingSvc.acceptServiceBid(bid.id, talentFoxerId)).rejects.toThrow('Unauthorized: only the event host can accept bids');
    await expect(BiddingSvc.rejectServiceBid(bid.id, talentFoxerId)).rejects.toThrow('Unauthorized: only the event host can reject bids');
  });

  it('Bid cannot use a deleted/unavailable Asset', async () => {
    const bid = await BiddingSvc.submitAssetBid({
      eventId, eventTemplateAssetId, providerId: gearFoxerId, proposedAssetId: deletedAssetId, proposedPrice: 100, proposedQuantity: 4
    });

    await expect(BiddingSvc.acceptAssetBid(bid.id, eventFoxerId)).rejects.toThrow('Asset is no longer available');
  });

  it('Gear requirement quantity must be fully satisfied', async () => {
    const bid = await BiddingSvc.submitAssetBid({
      eventId, eventTemplateAssetId, providerId: gearFoxerId, proposedAssetId: assetId, proposedPrice: 100,
      proposedQuantity: 2 // Requirement needs 4
    });

    await expect(BiddingSvc.acceptAssetBid(bid.id, eventFoxerId)).rejects.toThrow('Bid quantity does not fully satisfy the requirement');
  });

  it('Atomic rollback on failure (simulated)', async () => {
    const bid = await BiddingSvc.submitServiceBid({
      eventId, eventTemplateServiceId, providerId: talentFoxerId, proposedServiceId: serviceId, proposedPrice: 100
    });

    // We simulate an atomic rollback by intercepting the transaction and forcing tx.eventServiceTransaction.create to throw.
    const originalTransaction = prisma.$transaction.bind(prisma);
    const txSpy = vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
      return originalTransaction(async (tx: any) => {
        vi.spyOn(tx.eventServiceTransaction, 'create').mockRejectedValueOnce(new Error('Simulated DB Failure'));
        return callback(tx);
      });
    });

    await expect(BiddingSvc.acceptServiceBid(bid.id, eventFoxerId)).rejects.toThrow('Simulated DB Failure');

    // Due to rollback, bid should still be pending!
    const unchangedBid = await prisma.eventServiceBid.findUnique({ where: { id: bid.id } });
    expect(unchangedBid?.status).toBe('pending');
    
    txSpy.mockRestore();
  });
});
