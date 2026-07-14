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
    await seedTestBooking(eventId, userId, 1);

    const fillerEmail = `filler-${Date.now()}@test.com`;
    const filler = await seedTestUser(fillerEmail);
    extraUserIds.push(filler.id);
    await seedTestBooking(eventId, filler.id, 1);

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
    await prisma.waitlist.deleteMany({ where: { templateId } });

    await seedTestBooking(eventId, userId, 1);
    const filler = await seedTestUser(`fill2-${Date.now()}@test.com`);
    extraUserIds.push(filler.id);
    await seedTestBooking(eventId, filler.id, 1);

    waiterId = (await seedTestUser(`wait2-${Date.now()}@test.com`)).id;
    extraUserIds.push(waiterId);
    waiterToken = createTestToken(waiterId, `wait2-${Date.now()}@test.com`);

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

describe("Auto-assignment on cancellation", () => {
  let waiterId: string;
  let waiterToken: string;
  let bookingId: string;

  beforeAll(async () => {
    await prisma.waitlist.deleteMany({ where: { templateId } });

    await seedTestBooking(eventId, userId, 1);
    const filler = await seedTestUser(`autofill-${Date.now()}@test.com`);
    extraUserIds.push(filler.id);
    await seedTestBooking(eventId, filler.id, 1);

    waiterId = (await seedTestUser(`autowaiter-${Date.now()}@test.com`)).id;
    extraUserIds.push(waiterId);
    waiterToken = createTestToken(waiterId, `autowaiter-${Date.now()}@test.com`);

    await request(app)
      .post("/api/v1/waitlist")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({ templateId });

    const booking = await seedTestBooking(eventId, userId, 1);
    bookingId = booking.id;
  });

  it("should assign spot and create notification on cancellation", async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    const entry = await prisma.waitlist.findFirst({
      where: { templateId, userId: waiterId },
    });
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe("assigned");
    expect(entry!.holdExpiresAt).not.toBeNull();
    expect(entry!.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    const notification = await prisma.notification.findFirst({
      where: { userId: waiterId, type: "WAITLIST_SPOT_OPENED" },
    });
    expect(notification).not.toBeNull();
    expect(notification!.metadata).toHaveProperty(
      "link",
      `/booking/config?templateId=${templateId}&claimed=1`,
    );
  });
});

describe("Hold expiry", () => {
  it("should expire stale holds", async () => {
    const expiringUser = await seedTestUser(`expiry-${Date.now()}@test.com`);
    extraUserIds.push(expiringUser.id);

    await prisma.waitlist.create({
      data: {
        templateId,
        userId: expiringUser.id,
        status: "assigned",
        holdExpiresAt: new Date(Date.now() - 1000),
      },
    });

    const result = await prisma.waitlist.updateMany({
      where: {
        status: "assigned",
        holdExpiresAt: { lt: new Date() },
      },
      data: { status: "expired" },
    });

    expect(result.count).toBeGreaterThanOrEqual(1);

    const entry = await prisma.waitlist.findFirst({
      where: { templateId, userId: expiringUser.id },
    });
    expect(entry!.status).toBe("expired");
  });
});

describe("GET /api/v1/event-templates/browse/:id with ?claimed=1", () => {
  let claimedTemplateId: string;
  let claimedUserId: string;
  let claimedToken: string;

  beforeAll(async () => {
    const owner = await seedTestUser(`owner-claim-${Date.now()}@test.com`);
    extraUserIds.push(owner.id);
    const tmpl = await seedTestTemplate(owner.id, 2);
    claimedTemplateId = tmpl.id;

    const ev = await seedTestEvent(claimedTemplateId, owner.id);
    await seedTestBooking(ev.id, owner.id, 1);
    await seedTestBooking(ev.id, owner.id, 1);

    claimedUserId = (await seedTestUser(`claimed-user-${Date.now()}@test.com`)).id;
    extraUserIds.push(claimedUserId);
    claimedToken = createTestToken(claimedUserId, `claimed-user-${Date.now()}@test.com`);

    await prisma.waitlist.create({
      data: {
        templateId: claimedTemplateId,
        userId: claimedUserId,
        status: "assigned",
        holdExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
  });

  it("should return 401 without auth when claimed=1", async () => {
    const res = await request(app).get(
      `/api/v1/event-templates/browse/${claimedTemplateId}?claimed=1`,
    );
    expect(res.status).toBe(401);
  });

  it("should return template with reduced currentAttendees for valid hold", async () => {
    const res = await request(app)
      .get(`/api/v1/event-templates/browse/${claimedTemplateId}?claimed=1`)
      .set("Authorization", `Bearer ${claimedToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.currentAttendees).toBeDefined();
    expect(res.body.data.currentAttendees).toBeLessThan(2);
  });

  it("should return 403 for expired hold", async () => {
    const expiredUser = await seedTestUser(`expired-claim-${Date.now()}@test.com`);
    extraUserIds.push(expiredUser.id);
    const expiredToken = createTestToken(expiredUser.id, `expired-claim-${Date.now()}@test.com`);

    await prisma.waitlist.create({
      data: {
        templateId: claimedTemplateId,
        userId: expiredUser.id,
        status: "assigned",
        holdExpiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await request(app)
      .get(`/api/v1/event-templates/browse/${claimedTemplateId}?claimed=1`)
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(403);
  });

  it("should return 403 for user not on waitlist", async () => {
    const stranger = await seedTestUser(`stranger-${Date.now()}@test.com`);
    extraUserIds.push(stranger.id);
    const strangerToken = createTestToken(stranger.id, `stranger-${Date.now()}@test.com`);

    const res = await request(app)
      .get(`/api/v1/event-templates/browse/${claimedTemplateId}?claimed=1`)
      .set("Authorization", `Bearer ${strangerToken}`);

    expect(res.status).toBe(403);
  });

  it("should return template normally without claimed=1", async () => {
    const res = await request(app).get(
      `/api/v1/event-templates/browse/${claimedTemplateId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
