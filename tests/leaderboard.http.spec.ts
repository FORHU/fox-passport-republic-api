import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import type { RoleType } from "@prisma/client";
import app from "../src/app";
import { prisma } from "../src/utils/prisma";
import { signTestSession } from "./helpers/test-session";

describe("Foxer leaderboard (Supertest)", () => {
  const runId = Math.random().toString(36).substring(7);
  const city = `Testville_${runId}`;
  const userIds: string[] = [];
  let hostA: string;
  let hostB: string;
  let guest: string;
  let svcId: string;
  let perfId: string;
  let tokenA: string;
  let tokenGuest: string;

  async function user(label: string, roleType: RoleType[]) {
    const u = await prisma.user.create({
      data: {
        email: `${label}_${runId}@test.com`,
        username: `${label}_${runId}`,
        password: "pw",
        roleType,
        name: label,
        city: roleType.length > 0 ? city : null,
      },
    });
    userIds.push(u.id);
    return u;
  }

  async function host(organizerId: string) {
    const template = await prisma.eventTemplate.create({
      data: {
        ownerId: organizerId,
        name: "T",
        description: "d",
        category: "social",
      },
    });
    return prisma.event.create({
      data: {
        templateId: template.id,
        clientId: organizerId,
        organizerId,
        name: "E",
        description: "d",
        eventCategory: "social",
        eventStatus: "pending",
        requestStatus: "approved",
        guestCount: 2,
        totalAmount: 100,
        itemsTotal: 95,
        hostMarkupAmount: 0,
        platformFeeAmount: 5,
        startAt: new Date(),
        endAt: new Date(),
      },
    });
  }

  async function booking(
    eventId: string,
    userId: string,
    status: "completed" | "confirmed",
    endAt: Date,
  ) {
    return prisma.booking.create({
      data: {
        eventId,
        userId,
        guestCount: 1,
        totalAmount: 100,
        status,
        startAt: endAt,
        endAt,
      },
    });
  }

  /** A provider's service and one transaction on a booking. */
  async function serviceWork(
    providerId: string,
    eventId: string,
    bookingId: string,
    status: "approved" | "pending",
  ) {
    const service = await prisma.service.create({
      data: {
        ownerId: providerId,
        category: "design",
        name: "S",
        description: "d",
        price: 100,
        billingRate: "hourly",
      },
    });
    await prisma.eventServiceTransaction.create({
      data: {
        eventId,
        bookingId,
        serviceId: service.id,
        providerId,
        status,
        agreedPrice: 100,
      },
    });
  }

  beforeAll(async () => {
    const a = await user("hosta", ["eventFoxer"]);
    const b = await user("hostb", ["eventFoxer"]);
    const g = await user("guest", []);
    hostA = a.id;
    hostB = b.id;
    guest = g.id;
    tokenA = signTestSession({
      userId: a.id,
      email: a.email,
      roleType: a.roleType,
    });
    tokenGuest = signTestSession({
      userId: g.id,
      email: g.email,
      roleType: g.roleType,
    });

    const now = new Date();
    const lastMonth = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    const eventA = await host(hostA);
    const eventB = await host(hostB);

    // A: two completed this month. B: one completed, one only confirmed, and
    // one completed last month; only the first counts for B.
    await booking(eventA.id, guest, "completed", now);
    await booking(eventA.id, guest, "completed", now);
    await booking(eventB.id, guest, "completed", now);
    await booking(eventB.id, guest, "confirmed", now);
    await booking(eventB.id, guest, "completed", lastMonth);

    // Providers on event A. Only an approved transaction on a booking that was
    // completed this month counts.
    const done = await booking(eventA.id, guest, "completed", now);
    const open = await booking(eventA.id, guest, "confirmed", now);
    const old = await booking(eventA.id, guest, "completed", lastMonth);
    const svc = await user("svc", ["serviceFoxer"]);
    const perf = await user("perf", ["performerFoxer"]);
    const idle = await user("idle", ["serviceFoxer"]);
    svcId = svc.id;
    perfId = perf.id;
    await serviceWork(svc.id, eventA.id, done.id, "approved");
    await serviceWork(svc.id, eventA.id, open.id, "approved");
    await serviceWork(perf.id, eventA.id, done.id, "approved");
    await serviceWork(perf.id, eventA.id, old.id, "approved");
    await serviceWork(idle.id, eventA.id, done.id, "pending");
  });

  afterAll(async () => {
    await prisma.eventServiceTransaction.deleteMany({
      where: { providerId: { in: userIds } },
    });
    await prisma.service.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.booking.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.event.deleteMany({ where: { organizerId: { in: userIds } } });
    await prisma.eventTemplate.deleteMany({
      where: { ownerId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  const get = (qs: string, token = tokenA) =>
    request(app)
      .get(`/api/v1/leaderboard/foxers?${qs}`)
      .set("Authorization", `Bearer ${token}`);

  it("refuses a call without a session", async () => {
    const res = await request(app).get("/api/v1/leaderboard/foxers?role=event");
    expect(res.status).toBe(401);
  });

  it("refuses an unknown role and the tabs not built yet", async () => {
    expect((await get("role=wizard")).status).toBe(400);
    expect((await get("role=event&tab=rising")).status).toBe(400);
    expect((await get("")).status).toBe(400);
  });

  it("ranks hosts by completed bookings this month, with no counts", async () => {
    const res = await get(`role=event&city=${encodeURIComponent(city)}`);

    expect(res.status).toBe(200);
    const { rows, me, month } = res.body.data;
    expect(month).toMatch(/^\d{4}-\d{2}$/);
    expect(rows.map((r: { userId: string }) => r.userId)).toEqual([
      hostA,
      hostB,
    ]);
    expect(rows.map((r: { position: number }) => r.position)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      isMe: true,
      role: "event",
      rank: { number: 1, name: "Rookie" },
    });
    expect(me).toMatchObject({ userId: hostA, position: 1, isMe: true });
    expect(JSON.stringify(res.body)).not.toMatch(/"(n|count|bookings)"/);
  });

  it("filters by city without caring about case", async () => {
    const res = await get(
      `role=event&city=${encodeURIComponent(city.toUpperCase())}`,
    );
    expect(res.body.data.rows).toHaveLength(2);

    const none = await get("role=event&city=Nowhereville");
    expect(none.body.data.rows).toEqual([]);
  });

  it("gives a caller who is not on the board no pinned place", async () => {
    const res = await get(
      `role=event&city=${encodeURIComponent(city)}`,
      tokenGuest,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.me).toBeNull();
    expect(res.body.data.rows.some((r: { isMe: boolean }) => r.isMe)).toBe(
      false,
    );
  });

  it("counts a provider's approved transaction on a booking completed this month", async () => {
    const services = await get(
      `role=services&city=${encodeURIComponent(city)}`,
    );
    // svc has one that counts (the other is on an unfinished booking); idle
    // has only a pending transaction, and the performer is not a services
    // Foxer.
    expect(
      services.body.data.rows.map((r: { userId: string }) => r.userId),
    ).toEqual([svcId]);

    const performers = await get(
      `role=performers&city=${encodeURIComponent(city)}`,
    );
    // perf has one this month and one last month; the old one is outside.
    expect(
      performers.body.data.rows.map((r: { userId: string }) => r.userId),
    ).toEqual([perfId]);
    expect(performers.body.data.rows[0]).toMatchObject({
      role: "performers",
      position: 1,
      rank: { name: "Rookie" },
    });
  });

  it("answers for the roles with no data without error", async () => {
    for (const role of ["venue", "gear"]) {
      const res = await get(`role=${role}&city=${encodeURIComponent(city)}`);
      expect(res.status, role).toBe(200);
      expect(res.body.data.rows).toEqual([]);
    }
  });
});
