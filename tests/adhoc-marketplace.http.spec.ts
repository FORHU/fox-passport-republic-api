import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET } from "../src/config";
import { prisma } from "../src/utils/prisma";
import app from "../src/app";

describe("Ad-hoc marketplace HTTP endpoints — authorization", () => {
  const runId = Math.random().toString(36).substring(7);
  let owner: any;
  let provider: any;
  let stranger: any;
  let ownerToken: string;
  let providerToken: string;
  let strangerToken: string;

  let bookingId: string;
  let eventId: string;
  let assetId: string;

  const eventIds: string[] = [];
  const bookingIds: string[] = [];
  const assetIds: string[] = [];

  beforeAll(async () => {
    owner = await prisma.user.create({
      data: { email: `http_adhoc_owner_${runId}@test.com`, password: "pw", name: "Owner" },
    });
    provider = await prisma.user.create({
      data: { email: `http_adhoc_provider_${runId}@test.com`, password: "pw", name: "Provider" },
    });
    stranger = await prisma.user.create({
      data: { email: `http_adhoc_stranger_${runId}@test.com`, password: "pw", name: "Stranger" },
    });

    const sign = (u: any) =>
      jwt.sign({ userId: u.id, email: u.email, systemRole: "user", roleType: [] }, ACCESS_TOKEN_SECRET);
    ownerToken = sign(owner);
    providerToken = sign(provider);
    strangerToken = sign(stranger);

    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const event = await prisma.event.create({
      data: {
        clientId: owner.id,
        organizerId: owner.id,
        name: "HTTP ad-hoc test event",
        description: "desc",
        eventCategory: "corporate",
        startAt: start,
        endAt: end,
        guestCount: 5,
        totalAmount: 0,
      },
    });
    eventId = event.id;
    eventIds.push(eventId);

    const booking = await prisma.booking.create({
      data: {
        eventId,
        userId: owner.id,
        guestCount: 5,
        totalAmount: 0,
        status: "pending",
        startAt: start,
        endAt: end,
      },
    });
    bookingId = booking.id;
    bookingIds.push(bookingId);

    const asset = await prisma.asset.create({
      data: {
        ownerId: provider.id,
        category: "equipment",
        name: "HTTP ad-hoc test asset",
        description: "desc",
        quantity: 5,
        price: 100,
        billingRate: "daily",
        status: "available",
      },
    });
    assetId = asset.id;
    assetIds.push(assetId);
  });

  afterAll(async () => {
    await prisma.eventAssetTransaction.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, provider.id, stranger.id] } } });
    await prisma.$executeRaw`DELETE FROM request_idempotency_keys WHERE endpoint = 'POST /bookings/:id/items'`;
  });

  describe("POST /v1/bookings/:id/items", () => {
    it("401s with no auth", async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/items`)
        .send({ kind: "asset", itemId: assetId });
      expect(res.status).toBe(401);
    });

    it("400s with no Idempotency-Key header", async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/items`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ kind: "asset", itemId: assetId });
      expect(res.status).toBe(400);
    });

    it("403s (via BookingError status) for someone who is not the booking owner", async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/items`)
        .set("Authorization", `Bearer ${strangerToken}`)
        .set("Idempotency-Key", `stranger-${Math.random()}`)
        .send({ kind: "asset", itemId: assetId, quantity: 1 });
      expect(res.status).toBe(403);
    });

    it("201s for the booking owner and returns a pending_provider_confirmation item", async () => {
      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/items`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .set("Idempotency-Key", `owner-${Math.random()}`)
        .send({ kind: "asset", itemId: assetId, quantity: 1 });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("pending_provider_confirmation");
      expect(res.body.data.providerId).toBe(provider.id);
    });
  });

  describe("PATCH /v1/event-transactions/:id/review", () => {
    let transactionId: string;

    beforeAll(async () => {
      // A fresh asset, not the shared `assetId` — that one already has an
      // active (booking, asset) row from the POST test above, which the
      // partial unique index correctly refuses to duplicate.
      const reviewAsset = await prisma.asset.create({
        data: {
          ownerId: provider.id,
          category: "equipment",
          name: "HTTP review test asset",
          description: "desc",
          quantity: 5,
          price: 100,
          billingRate: "daily",
          status: "available",
        },
      });
      assetIds.push(reviewAsset.id);

      const row = await prisma.eventAssetTransaction.create({
        data: {
          eventId,
          bookingId,
          assetId: reviewAsset.id,
          providerId: provider.id,
          quantity: 1,
          agreedPrice: 100,
          status: "pending_provider_confirmation",
          confirmationDeadline: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      transactionId = row.id;
    });

    it("401s with no auth", async () => {
      const res = await request(app)
        .patch(`/api/v1/event-transactions/${transactionId}/review`)
        .send({ type: "asset", action: "confirm" });
      expect(res.status).toBe(401);
    });

    it("400s on an invalid action value (not the raw-status write this endpoint used to allow)", async () => {
      const res = await request(app)
        .patch(`/api/v1/event-transactions/${transactionId}/review`)
        .set("Authorization", `Bearer ${providerToken}`)
        .send({ type: "asset", action: "approved" }); // an old-style raw status, no longer accepted
      expect(res.status).toBe(400);
    });

    it("400s (via TransactionActorUnauthorizedError) for someone who is not the item's provider", async () => {
      const res = await request(app)
        .patch(`/api/v1/event-transactions/${transactionId}/review`)
        .set("Authorization", `Bearer ${strangerToken}`)
        .send({ type: "asset", action: "confirm" });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/only the provider/i);
    });

    it("200s for the actual provider confirming", async () => {
      const res = await request(app)
        .patch(`/api/v1/event-transactions/${transactionId}/review`)
        .set("Authorization", `Bearer ${providerToken}`)
        .send({ type: "asset", action: "confirm" });
      expect(res.status).toBe(200);
      expect(res.body.updated.status).toBe("approved");
    });
  });
});
