import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import {
  createTestToken,
  seedTestUser,
  seedTestTemplate,
  seedTestEvent,
  seedTestBooking,
} from "./setup";

let userId: string;
let token: string;
let templateId: string;
let eventId: string;

const testEmail = `waitlist-main-${Date.now()}@test.com`;
const extraUserIds: string[] = [];

beforeAll(async () => {
  const user = await seedTestUser(testEmail);
  userId = user.id;
  token = createTestToken(userId, testEmail);

  const template = await seedTestTemplate(userId, 2);
  templateId = template.id;

  const event = await seedTestEvent(templateId, userId);
  eventId = event.id;
});

afterAll(async () => {
  // Clean everything: bookings → events → waitlist → templates → all test users
  const events = await prisma.event.findMany({
    where: { templateId },
    select: { id: true },
  });
  const eventIds = events.map((e) => e.id);
  if (eventIds.length > 0) {
    await prisma.booking.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  }
  await prisma.waitlist.deleteMany({ where: { templateId } });
  await prisma.eventTemplate.deleteMany({ where: { id: templateId } });
  const allUserIds = [userId, ...extraUserIds];
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
});

describe("GET /api/v1/waitlist", () => {
  it("should return empty waitlist status without auth", async () => {
    const res = await request(app).get(
      `/api/v1/waitlist?templateId=${templateId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isOnWaitlist).toBe(false);
    expect(res.body.data.position).toBeNull();
    expect(res.body.data.entryId).toBeNull();
    expect(res.body.data.totalWaiting).toBe(0);
  });

  it("should return 400 if templateId is missing", async () => {
    const res = await request(app).get("/api/v1/waitlist");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/waitlist", () => {
  it("should return 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/v1/waitlist")
      .send({ templateId });
    expect(res.status).toBe(401);
  });

  it("should reject join when template has no maxAttendees", async () => {
    const user2 = await seedTestUser(`no-limit-${Date.now()}@test.com`);
    extraUserIds.push(user2.id);
    const noLimitTemplate = await seedTestTemplate(user2.id, null);

    const res = await request(app)
      .post("/api/v1/waitlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ templateId: noLimitTemplate.id });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("no capacity limit");
  });

  it("should reject join when event is not at capacity", async () => {
    const res = await request(app)
      .post("/api/v1/waitlist")
      .set("Authorization", `Bearer ${token}`)
      .send({ templateId });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("not at capacity");
  });

  it("should join the waitlist when at capacity", async () => {
    // Fill the template: maxAttendees=2, create 2 bookings (guestCount=1 each)
    await seedTestBooking(eventId, userId, 1);

    const fillerEmail = `filler-${Date.now()}@test.com`;
    const filler = await seedTestUser(fillerEmail);
    extraUserIds.push(filler.id);
    await seedTestBooking(eventId, filler.id, 1);

    // Now the template is at capacity (2 guests >= maxAttendees 2)
    const waiterEmail = `waiter-${Date.now()}@test.com`;
    const waiter = await seedTestUser(waiterEmail);
    extraUserIds.push(waiter.id);
    const waiterToken = createTestToken(waiter.id, waiterEmail);

    const res = await request(app)
      .post("/api/v1/waitlist")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({ templateId });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.position).toBe(1);
    expect(res.body.data.totalWaiting).toBe(1);
  });
});

describe("GET /api/v1/waitlist (after joining)", () => {
  let waiterId: string;
  let waiterToken: string;
  let entryId: string;

  beforeAll(async () => {
    // Clean any leftover waitlist entries from previous tests
    await prisma.waitlist.deleteMany({ where: { templateId } });

    // Fill the template
    await seedTestBooking(eventId, userId, 1);
    const filler = await seedTestUser(`fill2-${Date.now()}@test.com`);
    extraUserIds.push(filler.id);
    await seedTestBooking(eventId, filler.id, 1);

    waiterId = (await seedTestUser(`wait2-${Date.now()}@test.com`)).id;
    extraUserIds.push(waiterId);
    waiterToken = createTestToken(waiterId, `wait2-${Date.now()}@test.com`);

    // Join waitlist
    const joinRes = await request(app)
      .post("/api/v1/waitlist")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({ templateId });

    entryId = joinRes.body.data.entry.id;
  });

  it("should show the user's position on the waitlist", async () => {
    const res = await request(app)
      .get(`/api/v1/waitlist?templateId=${templateId}`)
      .set("Authorization", `Bearer ${waiterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isOnWaitlist).toBe(true);
    expect(res.body.data.position).toBe(1);
    expect(res.body.data.entryId).toBe(entryId);
    expect(res.body.data.totalWaiting).toBe(1);
  });

  it("should not show position for a different user", async () => {
    const otherEmail = `other-${Date.now()}@test.com`;
    const otherUser = await seedTestUser(otherEmail);
    extraUserIds.push(otherUser.id);
    const otherToken = createTestToken(otherUser.id, otherEmail);

    const res = await request(app)
      .get(`/api/v1/waitlist?templateId=${templateId}`)
      .set("Authorization", `Bearer ${otherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isOnWaitlist).toBe(false);
  });
});

describe("DELETE /api/v1/waitlist/:id", () => {
  let waiterId: string;
  let waiterToken: string;
  let entryId: string;

  beforeAll(async () => {
    // Fill the template
    await seedTestBooking(eventId, userId, 1);
    const filler = await seedTestUser(`delfiller-${Date.now()}@test.com`);
    extraUserIds.push(filler.id);
    await seedTestBooking(eventId, filler.id, 1);

    waiterId = (await seedTestUser(`delwaiter-${Date.now()}@test.com`)).id;
    extraUserIds.push(waiterId);
    waiterToken = createTestToken(waiterId, `delwaiter-${Date.now()}@test.com`);

    const joinRes = await request(app)
      .post("/api/v1/waitlist")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({ templateId });

    entryId = joinRes.body.data.entry.id;
  });

  it("should leave the waitlist", async () => {
    const res = await request(app)
      .delete(`/api/v1/waitlist/${entryId}`)
      .set("Authorization", `Bearer ${waiterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify removed
    const statusRes = await request(app)
      .get(`/api/v1/waitlist?templateId=${templateId}`)
      .set("Authorization", `Bearer ${waiterToken}`);

    expect(statusRes.body.data.isOnWaitlist).toBe(false);
  });

  it("should return 401 without auth", async () => {
    const res = await request(app).delete(`/api/v1/waitlist/some-id`);
    expect(res.status).toBe(401);
  });

  it("should return 400 for non-existent entry", async () => {
    const res = await request(app)
      .delete("/api/v1/waitlist/non-existent-id")
      .set("Authorization", `Bearer ${waiterToken}`);
    expect(res.status).toBe(400);
  });
});

describe("Duplicate join prevention", () => {
  let dupeUserId: string;
  let dupeToken: string;

  beforeAll(async () => {
    await seedTestBooking(eventId, userId, 1);
    const filler = await seedTestUser(`dupfiller-${Date.now()}@test.com`);
    extraUserIds.push(filler.id);
    await seedTestBooking(eventId, filler.id, 1);

    dupeUserId = (await seedTestUser(`dupe-${Date.now()}@test.com`)).id;
    extraUserIds.push(dupeUserId);
    dupeToken = createTestToken(dupeUserId, `dupe-${Date.now()}@test.com`);

    // First join
    await request(app)
      .post("/api/v1/waitlist")
      .set("Authorization", `Bearer ${dupeToken}`)
      .send({ templateId });
  });

  it("should reject a second join attempt", async () => {
    const res = await request(app)
      .post("/api/v1/waitlist")
      .set("Authorization", `Bearer ${dupeToken}`)
      .send({ templateId });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("already on the waitlist");
  });
});
