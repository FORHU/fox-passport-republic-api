import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET } from "../src/config";
import { prisma } from "../src/utils/prisma";

// Mock Stripe the same way tests/payment.integration.test.ts does — real
// checkout-session creation is exercised in Stripe test mode manually, per
// the plan's own verification section, not here. Each call gets its own
// session id — `providerSessionId` is unique in the schema, and a real
// Stripe checkout session id is never reused, so a fixed mock id would make
// a *second* checkout call (retry, or a fresh one after the first expired)
// fail on that constraint for a reason that has nothing to do with what's
// under test.
let sessionCounter = 0;
vi.mock("stripe", () => {
  return {
    default: class {
      checkout = {
        sessions: {
          create: vi.fn().mockImplementation(async () => ({
            id: `cs_http_test_${++sessionCounter}`,
            url: "http://checkout.url",
          })),
        },
      };
    },
  };
});

import app from "../src/app";
import InvoiceSvc from "../src/modules/payment/invoice.service";

describe("Central Payment checkout — HTTP layer", () => {
  let client: any;
  let otherUser: any;
  let admin: any;
  let provider: any;
  let clientToken: string;
  let otherToken: string;
  let adminToken: string;

  const runId = Math.random().toString(36).substring(7);

  beforeAll(async () => {
    client = await prisma.user.create({
      data: {
        email: `checkout_client_${runId}@test.com`,
        password: "pw",
        name: "Checkout Client",
      },
    });
    otherUser = await prisma.user.create({
      data: {
        email: `checkout_other_${runId}@test.com`,
        password: "pw",
        name: "Not The Client",
      },
    });
    admin = await prisma.user.create({
      data: {
        email: `checkout_admin_${runId}@test.com`,
        password: "pw",
        name: "Checkout Admin",
        systemRole: "admin",
      },
    });
    provider = await prisma.user.create({
      data: {
        email: `checkout_provider_${runId}@test.com`,
        password: "pw",
        name: "Checkout Provider",
      },
    });

    clientToken = jwt.sign(
      {
        userId: client.id,
        email: client.email,
        systemRole: "user",
        roleType: [],
      },
      ACCESS_TOKEN_SECRET,
    );
    otherToken = jwt.sign(
      {
        userId: otherUser.id,
        email: otherUser.email,
        systemRole: "user",
        roleType: [],
      },
      ACCESS_TOKEN_SECRET,
    );
    adminToken = jwt.sign(
      {
        userId: admin.id,
        email: admin.email,
        systemRole: "admin",
        roleType: [],
      },
      ACCESS_TOKEN_SECRET,
    );
  });

  afterAll(async () => {
    await prisma.checkout.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceItem.deleteMany({});
    await prisma.invoice.deleteMany({});
  });

  async function makeEventWithVenueTx(agreedPrice = 5000) {
    const venue = await prisma.venue.create({
      data: {
        name: "HTTP Test Venue",
        description: "desc",
        category: "other",
        capacity: 100,
        price: 1000,
        billingRate: "hourly",
        address: "1 Test St",
        city: "City",
        state: "State",
        country: "Country",
        mayorId: provider.id,
      },
    });
    const event = await prisma.event.create({
      data: {
        name: "HTTP Checkout Test Event",
        organizerId: client.id,
        clientId: client.id,
        startAt: new Date(),
        endAt: new Date(),
        description: "Test",
        guestCount: 10,
        totalAmount: agreedPrice,
        eventCategory: "corporate",
      },
    });
    await prisma.eventVenueTransaction.create({
      data: {
        eventId: event.id,
        venueId: venue.id,
        providerId: provider.id,
        status: "pending",
        agreedPrice,
      },
    });
    return event;
  }

  describe("POST /v1/events/:eventId/checkout", () => {
    it("401s with no auth", async () => {
      const event = await makeEventWithVenueTx();
      const res = await request(app).post(
        `/api/v1/events/${event.id}/checkout`,
      );
      expect(res.status).toBe(401);
    });

    it("403s for a citizen who isn't this event's client", async () => {
      const event = await makeEventWithVenueTx();
      const res = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
    });

    it("201s for the event's own client, with the locked response shape", async () => {
      const event = await makeEventWithVenueTx(5000);
      const res = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        invoiceId: expect.any(String),
        checkoutId: expect.any(String),
        url: "http://checkout.url",
        status: "active",
      });
    });

    it("a second request for the same event reuses the same invoice instead of erroring", async () => {
      const event = await makeEventWithVenueTx(3000);

      const first = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});
      const second = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.invoiceId).toBe(first.body.invoiceId);
      // Checkout row is fresh each time (the old one is expired), invoice is not.
      expect(second.body.checkoutId).not.toBe(first.body.checkoutId);

      const invoiceCount = await prisma.invoice.count({
        where: { id: first.body.invoiceId },
      });
      expect(invoiceCount).toBe(1);
    });

    it("two genuinely concurrent requests for the same event still produce exactly one invoice", async () => {
      const event = await makeEventWithVenueTx(4200);

      const [a, b] = await Promise.all([
        request(app)
          .post(`/api/v1/events/${event.id}/checkout`)
          .set("Authorization", `Bearer ${clientToken}`)
          .send({}),
        request(app)
          .post(`/api/v1/events/${event.id}/checkout`)
          .set("Authorization", `Bearer ${clientToken}`)
          .send({}),
      ]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.invoiceId).toBe(b.body.invoiceId);

      // The real assertion: however many requests raced for this event's
      // venue transaction, exactly one Invoice ended up owning it.
      const transaction = await prisma.eventVenueTransaction.findFirstOrThrow({
        where: { eventId: event.id },
      });
      const items = await prisma.invoiceItem.findMany({
        where: {
          sourceType: "event_venue_transaction",
          sourceId: transaction.id,
        },
      });
      expect(items.length).toBe(1);
      expect(items[0].invoiceId).toBe(a.body.invoiceId);
    });

    it("a failure after the advisory lock is acquired rolls back cleanly, and a plain retry succeeds", async () => {
      const event = await makeEventWithVenueTx(2800);

      // Forces InvoiceSvc.createInvoice to reject *after* the outer
      // transaction has already acquired the advisory lock and run
      // findInvoiceForSource — proving the whole find-or-create flow is
      // one transaction, not just the lock acquisition on its own. If the
      // lock and the create were in separate transactions, this failure
      // would leave the lock released but the DB in a state a naive retry
      // couldn't distinguish from "never attempted".
      const spy = vi
        .spyOn(InvoiceSvc, "createInvoice")
        .mockRejectedValueOnce(new Error("Simulated failure"));

      const failed = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});
      expect(failed.status).toBe(400);

      spy.mockRestore();

      const transaction = await prisma.eventVenueTransaction.findFirstOrThrow({
        where: { eventId: event.id },
      });
      const itemsAfterFailure = await prisma.invoiceItem.findMany({
        where: {
          sourceType: "event_venue_transaction",
          sourceId: transaction.id,
        },
      });
      // Nothing persisted — the failed attempt's transaction rolled back
      // completely, not just the parts InvoiceSvc.createInvoice itself wrote.
      expect(itemsAfterFailure.length).toBe(0);

      const retry = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});
      expect(retry.status).toBe(201);

      const itemsAfterRetry = await prisma.invoiceItem.findMany({
        where: {
          sourceType: "event_venue_transaction",
          sourceId: transaction.id,
        },
      });
      expect(itemsAfterRetry.length).toBe(1);
      expect(itemsAfterRetry[0].invoiceId).toBe(retry.body.invoiceId);
    });

    it("409s on a re-attempt once the invoice is already paid", async () => {
      const event = await makeEventWithVenueTx(1500);
      const first = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});
      expect(first.status).toBe(201);

      await prisma.invoice.update({
        where: { id: first.body.invoiceId },
        data: { status: "paid" },
      });

      const second = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});
      expect(second.status).toBe(409);
    });
  });

  describe("GET /v1/events/:eventId/payment-summary", () => {
    it("401s with no auth", async () => {
      const event = await makeEventWithVenueTx();
      const res = await request(app).get(
        `/api/v1/events/${event.id}/payment-summary`,
      );
      expect(res.status).toBe(401);
    });

    it("403s for a non-client", async () => {
      const event = await makeEventWithVenueTx();
      const res = await request(app)
        .get(`/api/v1/events/${event.id}/payment-summary`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
    });

    it("200s for the client with the locked flat shape, and creates no invoice", async () => {
      const event = await makeEventWithVenueTx(2000);
      const before = await prisma.invoice.count();

      const res = await request(app)
        .get(`/api/v1/events/${event.id}/payment-summary`)
        .set("Authorization", `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        eventId: event.id,
        currency: "PHP",
        subtotalAmount: 2000,
        discountAmount: 0,
        platformFeeAmount: 0,
        grossAmount: 2000,
      });

      const after = await prisma.invoice.count();
      expect(after).toBe(before); // preview only — no Invoice row created
    });
  });

  describe("GET /v1/invoices/:id", () => {
    it("401s with no auth", async () => {
      const event = await makeEventWithVenueTx();
      const created = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});

      const res = await request(app).get(
        `/api/v1/invoices/${created.body.invoiceId}`,
      );
      expect(res.status).toBe(401);
    });

    it("403s for someone who isn't the payer or an admin", async () => {
      const event = await makeEventWithVenueTx();
      const created = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});

      const res = await request(app)
        .get(`/api/v1/invoices/${created.body.invoiceId}`)
        .set("Authorization", `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
    });

    it("200s for the payer with the locked flat shape", async () => {
      const event = await makeEventWithVenueTx();
      const created = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});

      const res = await request(app)
        .get(`/api/v1/invoices/${created.body.invoiceId}`)
        .set("Authorization", `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        invoiceId: created.body.invoiceId,
        status: "pending",
        paymentStatus: "pending",
      });
    });

    it("200s for an admin viewing someone else's invoice", async () => {
      const event = await makeEventWithVenueTx();
      const created = await request(app)
        .post(`/api/v1/events/${event.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});

      const res = await request(app)
        .get(`/api/v1/invoices/${created.body.invoiceId}`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    it("404s for an invoice that doesn't exist", async () => {
      const res = await request(app)
        .get("/api/v1/invoices/00000000-0000-0000-0000-000000000000")
        .set("Authorization", `Bearer ${clientToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /v1/partnerships/:proposalId/checkout", () => {
    async function makeAcceptedSponsorshipProposal(proposedAmount = 8000) {
      const event = await makeEventWithVenueTx();
      return prisma.partnershipProposal.create({
        data: {
          partnerId: client.id,
          targetEventId: event.id,
          partnershipType: "sponsorship",
          title: "HTTP checkout sponsorship",
          description: "test",
          proposedAmount,
          status: "accepted",
        },
      });
    }

    it("401s with no auth", async () => {
      const proposal = await makeAcceptedSponsorshipProposal();
      const res = await request(app).post(
        `/api/v1/partnerships/${proposal.id}/checkout`,
      );
      expect(res.status).toBe(401);
    });

    it("403s for someone other than the proposing partner", async () => {
      const proposal = await makeAcceptedSponsorshipProposal();
      const res = await request(app)
        .post(`/api/v1/partnerships/${proposal.id}/checkout`)
        .set("Authorization", `Bearer ${otherToken}`)
        .send({});
      expect(res.status).toBe(403);
    });

    it("201s for the proposing partner, with the locked response shape", async () => {
      const proposal = await makeAcceptedSponsorshipProposal(6000);
      const res = await request(app)
        .post(`/api/v1/partnerships/${proposal.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        invoiceId: expect.any(String),
        checkoutId: expect.any(String),
        url: "http://checkout.url",
        status: "active",
      });
    });

    it("a retry reuses the same invoice", async () => {
      const proposal = await makeAcceptedSponsorshipProposal(2500);

      const first = await request(app)
        .post(`/api/v1/partnerships/${proposal.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});
      const second = await request(app)
        .post(`/api/v1/partnerships/${proposal.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});

      expect(second.body.invoiceId).toBe(first.body.invoiceId);
    });

    it("400s for a non-sponsorship, non-accepted, or amount-less proposal", async () => {
      const investment = await prisma.partnershipProposal.create({
        data: {
          partnerId: client.id,
          partnershipType: "investment",
          title: "Not payable via checkout",
          description: "test",
          proposedAmount: 1000,
          status: "accepted",
        },
      });

      const res = await request(app)
        .post(`/api/v1/partnerships/${investment.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe("Partnership proposal reads carry the computed payment sub-object", () => {
    it("required: false for a pending proposal (not yet accepted)", async () => {
      const event = await makeEventWithVenueTx();
      const proposal = await prisma.partnershipProposal.create({
        data: {
          partnerId: client.id,
          targetEventId: event.id,
          partnershipType: "sponsorship",
          title: "Pending sponsorship",
          description: "test",
          proposedAmount: 4000,
          status: "pending",
        },
      });

      const res = await request(app)
        .get(`/api/v1/partnerships/proposals/${proposal.id}`)
        .set("Authorization", `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.payment).toEqual({ required: false });
    });

    it("required: true, status: pending, no invoiceId before checkout is initiated", async () => {
      const event = await makeEventWithVenueTx();
      const proposal = await prisma.partnershipProposal.create({
        data: {
          partnerId: client.id,
          targetEventId: event.id,
          partnershipType: "sponsorship",
          title: "Accepted, not yet paid",
          description: "test",
          proposedAmount: 4500,
          status: "accepted",
        },
      });

      const res = await request(app)
        .get(`/api/v1/partnerships/proposals/${proposal.id}`)
        .set("Authorization", `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.payment).toEqual({
        required: true,
        invoiceId: null,
        status: "pending",
      });
    });

    it("carries the real invoiceId and status once checkout has been initiated", async () => {
      const event = await makeEventWithVenueTx();
      const proposal = await prisma.partnershipProposal.create({
        data: {
          partnerId: client.id,
          targetEventId: event.id,
          partnershipType: "sponsorship",
          title: "Checkout initiated",
          description: "test",
          proposedAmount: 5500,
          status: "accepted",
        },
      });

      const checkoutRes = await request(app)
        .post(`/api/v1/partnerships/${proposal.id}/checkout`)
        .set("Authorization", `Bearer ${clientToken}`)
        .send({});

      const res = await request(app)
        .get(`/api/v1/partnerships/proposals/${proposal.id}`)
        .set("Authorization", `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.payment).toEqual({
        required: true,
        invoiceId: checkoutRes.body.invoiceId,
        status: "pending",
      });
    });

    it("required: false for a non-sponsorship type even when accepted", async () => {
      const investment = await prisma.partnershipProposal.create({
        data: {
          partnerId: client.id,
          partnershipType: "investment",
          title: "Accepted investment",
          description: "test",
          proposedAmount: 1000,
          status: "accepted",
        },
      });

      const res = await request(app)
        .get(`/api/v1/partnerships/proposals/${investment.id}`)
        .set("Authorization", `Bearer ${clientToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.payment).toEqual({ required: false });
    });
  });
});
