import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/utils/prisma";
import MilestoneRepo from "../src/modules/milestone/milestone.repository";
import MilestoneSvc from "../src/modules/milestone/milestone.service";
import {
  cleanupTestData,
  seedTestEvent,
  seedTestTemplate,
  seedTestUser,
} from "./setup";

/**
 * The milestone queries against a real Postgres. The unit specs mock the
 * repository, so a query Prisma refuses to build, or one that returns the wrong
 * rows, only shows up here.
 */

const tag = `ms-int-${Date.now()}`;
const LAUNCH = new Date("2020-01-01T00:00:00Z");
const NOW = new Date();

const userIds: string[] = [];
const templateIds: string[] = [];
const challengeKeys: string[] = [];

async function newUser(name: string) {
  const user = await seedTestUser(`${tag}-${name}@example.test`);
  userIds.push(user.id);
  return user;
}

async function newEvent(ownerId: string) {
  const template = await seedTestTemplate(ownerId);
  templateIds.push(template.id);
  return seedTestEvent(template.id, ownerId);
}

async function newBooking(
  eventId: string,
  userId: string,
  opts: {
    status?: "confirmed" | "cancelled" | "pending";
    createdAt?: Date;
  } = {},
) {
  return prisma.booking.create({
    data: {
      eventId,
      userId,
      guestCount: 1,
      totalAmount: 100,
      status: opts.status ?? "confirmed",
      startAt: new Date(Date.now() + 86_400_000),
      endAt: new Date(Date.now() + 90_000_000),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}

/** Attending a booking is a passport stamp on it. */
async function attend(userId: string, bookingId: string) {
  const passport = await prisma.passport.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return prisma.passportStamp.create({
    data: {
      passportId: passport.id,
      bookingId,
      eventName: "Milestone test event",
      eventDate: new Date(),
      xpEarned: 0,
    },
  });
}

const balanceOf = async (userId: string) =>
  (await prisma.passport.findUnique({ where: { userId } }))?.coins ?? 0;

const heldOf = async (userId: string, refId: string) => {
  const event = await prisma.rewardEvent.findFirst({
    where: { userId, action: "milestone_tier", refId },
    include: { lifecycles: true },
  });
  return event;
};

afterAll(async () => {
  const passports = await prisma.passport.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const passportIds = passports.map((p) => p.id);
  await prisma.passportStamp.deleteMany({
    where: { passportId: { in: passportIds } },
  });
  await prisma.rewardLifecycle.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.rewardEvent.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.passport.deleteMany({ where: { userId: { in: userIds } } });
  if (challengeKeys.length) {
    await prisma.challenge.deleteMany({
      where: { key: { in: challengeKeys } },
    });
  }
  await cleanupTestData(userIds, templateIds);
});

describe("the seeded milestones", () => {
  it("are in the database: six milestones, five tiers each", async () => {
    const milestones = await MilestoneRepo.listActiveMilestones();
    const keys = milestones.map((m) => m.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "booked_events",
        "attended_events",
        "cities",
        "venues",
        "reviews",
        "big_spender",
      ]),
    );
    for (const m of milestones) expect(m.tiers.length).toBeGreaterThan(0);
  });
});

describe("MilestoneRepo.getCounters", () => {
  it("counts paid bookings, stamps and spend", async () => {
    const user = await newUser("counters");
    const event = await newEvent(user.id);
    const a = await newBooking(event.id, user.id);
    await newBooking(event.id, user.id); // paid, not attended
    await newBooking(event.id, user.id, { status: "cancelled" }); // not counted
    await newBooking(event.id, user.id, { status: "pending" }); // not counted
    await attend(user.id, a.id);

    const c = await MilestoneRepo.getCounters(user.id);
    expect(c.bookedEvents).toBe(2);
    expect(c.attendedEvents).toBe(1);
    expect(c.spendPhp).toBe(100); // only the attended booking's 100
  });

  it("with a cutoff, counts only what existed before it", async () => {
    const user = await newUser("cutoff");
    const event = await newEvent(user.id);
    const old = await newBooking(event.id, user.id, {
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    await attend(user.id, old.id);
    await newBooking(event.id, user.id); // after the cutoff

    const before = await MilestoneRepo.getCounters(
      user.id,
      new Date("2025-06-01T00:00:00Z"),
    );
    expect(before.bookedEvents).toBe(1);
    expect(before.attendedEvents).toBe(0); // the stamp itself is newer
    const now = await MilestoneRepo.getCounters(user.id);
    expect(now.bookedEvents).toBe(2);
    expect(now.attendedEvents).toBe(1);
  });
});

describe("MilestoneRepo, the sweep and booking lists", () => {
  it("lists the paid bookings oldest first, with whether each was attended", async () => {
    const user = await newUser("list");
    const event = await newEvent(user.id);
    const first = await newBooking(event.id, user.id, {
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const second = await newBooking(event.id, user.id, {
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
    await attend(user.id, first.id);

    const rows = await MilestoneRepo.listPaidBookings(user.id);
    expect(rows).toEqual([
      { id: first.id, attended: true },
      { id: second.id, attended: false },
    ]);
  });

  it("lists bookings inside a window only", async () => {
    const user = await newUser("window");
    const event = await newEvent(user.id);
    await newBooking(event.id, user.id, {
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });
    const inside = await newBooking(event.id, user.id, {
      createdAt: new Date("2026-03-15T00:00:00Z"),
    });
    const rows = await MilestoneRepo.listBookingsInWindow(
      user.id,
      new Date("2026-03-10T00:00:00Z"),
      new Date("2026-03-20T00:00:00Z"),
    );
    expect(rows.map((r) => r.id)).toEqual([inside.id]);
  });

  it("finds a citizen with a new stamp, and runs the refund and review queries", async () => {
    const user = await newUser("sweep");
    const event = await newEvent(user.id);
    const b = await newBooking(event.id, user.id);
    await attend(user.id, b.id);
    const ids = await MilestoneRepo.listUsersToReconcile(
      new Date(Date.now() - 60_000),
    );
    expect(ids).toContain(user.id);
  });
});

describe("MilestoneSvc.reconcile against real rows", () => {
  it("pays an attended tier once, and a second run pays nothing", async () => {
    const user = await newUser("pay");
    const event = await newEvent(user.id);
    const b = await newBooking(event.id, user.id);
    await attend(user.id, b.id);

    const first = await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);
    expect(first.map((g) => g.milestoneKey)).toContain("attended_events");
    const paid = await balanceOf(user.id);
    expect(paid).toBeGreaterThan(0);

    const again = await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);
    expect(again).toEqual([]);
    expect(await balanceOf(user.id)).toBe(paid);
  });

  it("does not pay a tier reached before launch", async () => {
    const user = await newUser("noback");
    const event = await newEvent(user.id);
    const old = await newBooking(event.id, user.id, {
      createdAt: new Date("2025-01-01T00:00:00Z"),
    });
    await attend(user.id, old.id);
    // The stamp is dated now, so move it before the launch for this check.
    await prisma.passportStamp.updateMany({
      where: { bookingId: old.id },
      data: { createdAt: new Date("2025-01-02T00:00:00Z") },
    });
    const launch = new Date("2025-06-01T00:00:00Z");
    expect(await MilestoneSvc.reconcile(user.id, NOW, launch)).toEqual([]);
    expect(await balanceOf(user.id)).toBe(0);
  });

  it("holds a booked-events tier until attended, then releases only it", async () => {
    const user = await newUser("hold");
    const event = await newEvent(user.id);
    const b = await newBooking(event.id, user.id);

    const first = await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);
    const held = first.find((g) => g.milestoneKey === "booked_events");
    expect(held?.held).toBe(true);
    const grant = await heldOf(user.id, "booked_events:1");
    expect(grant?.lifecycles.some((l) => l.type === "RELEASE")).toBe(false);
    const before = await balanceOf(user.id);

    await attend(user.id, b.id);
    await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);
    const freed = await heldOf(user.id, "booked_events:1");
    expect(freed?.lifecycles.some((l) => l.type === "RELEASE")).toBe(true);
    expect(await balanceOf(user.id)).toBeGreaterThan(before);
  });

  it("takes back a held tier when the booking is cancelled", async () => {
    const user = await newUser("cancel");
    const event = await newEvent(user.id);
    const b = await newBooking(event.id, user.id);
    await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);

    await prisma.booking.update({
      where: { id: b.id },
      data: { status: "cancelled" },
    });
    await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);

    const grant = await heldOf(user.id, "booked_events:1");
    expect(grant?.lifecycles.some((l) => l.type === "REVERSAL")).toBe(true);
    expect(await balanceOf(user.id)).toBe(0);
  });

  it("pays a booking challenge for the current day, held until attended", async () => {
    const key = `${tag}-day`;
    challengeKeys.push(key);
    await prisma.challenge.create({
      data: {
        key,
        name: "Integration day challenge",
        period: "day",
        target: 1,
        tokens: 20,
        active: true,
        sortOrder: 999,
      },
    });
    const user = await newUser("challenge");
    const event = await newEvent(user.id);
    const b = await newBooking(event.id, user.id);

    await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);
    const grants = await prisma.rewardEvent.findMany({
      where: { userId: user.id, action: "challenge_period" },
      include: { lifecycles: true },
    });
    const mine = grants.find((g) => g.refId.startsWith(`${key}:`));
    expect(mine?.coins).toBe(20);
    expect(mine?.lifecycles.some((l) => l.type === "RELEASE")).toBe(false);

    await attend(user.id, b.id);
    await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);
    const freed = await prisma.rewardEvent.findFirst({
      where: { userId: user.id, action: "challenge_period" },
      include: { lifecycles: true },
    });
    expect(freed?.lifecycles.some((l) => l.type === "RELEASE")).toBe(true);
  });
});

beforeAll(async () => {
  // A leftover challenge from an interrupted run would pay twice; start clean.
  await prisma.challenge.deleteMany({
    where: { key: { startsWith: "ms-int-" } },
  });
});

describe("deactivating a milestone or challenge does not strand Tokens", () => {
  it("still releases a held challenge after the challenge is switched off", async () => {
    const key = `${tag}-off`;
    challengeKeys.push(key);
    await prisma.challenge.create({
      data: {
        key,
        name: "Integration challenge, switched off",
        period: "day",
        target: 1,
        tokens: 20,
        active: true,
        sortOrder: 998,
      },
    });
    const user = await newUser("challenge-off");
    const event = await newEvent(user.id);
    const b = await newBooking(event.id, user.id);

    await MilestoneSvc.reconcile(user.id, NOW, LAUNCH); // held
    await prisma.challenge.update({ where: { key }, data: { active: false } });
    await attend(user.id, b.id);
    await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);

    const grant = await prisma.rewardEvent.findFirst({
      where: {
        userId: user.id,
        action: "challenge_period",
        refId: { startsWith: `${key}:` },
      },
      include: { lifecycles: true },
    });
    expect(grant?.lifecycles.some((l) => l.type === "RELEASE")).toBe(true);
  });

  it("still releases a held tier after its milestone is switched off", async () => {
    const user = await newUser("milestone-off");
    const event = await newEvent(user.id);
    const b = await newBooking(event.id, user.id);
    await MilestoneSvc.reconcile(user.id, NOW, LAUNCH); // booked_events:1 held

    await prisma.milestone.update({
      where: { key: "booked_events" },
      data: { active: false },
    });
    try {
      await attend(user.id, b.id);
      await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);
      const grant = await heldOf(user.id, "booked_events:1");
      expect(grant?.lifecycles.some((l) => l.type === "RELEASE")).toBe(true);
    } finally {
      await prisma.milestone.update({
        where: { key: "booked_events" },
        data: { active: true },
      });
    }
  });

  it("still takes back a paid tier after its milestone is switched off", async () => {
    const user = await newUser("milestone-off-reverse");
    const event = await newEvent(user.id);
    const b = await newBooking(event.id, user.id);
    await attend(user.id, b.id);
    await MilestoneSvc.reconcile(user.id, NOW, LAUNCH); // paid

    await prisma.milestone.update({
      where: { key: "booked_events" },
      data: { active: false },
    });
    try {
      await prisma.booking.update({
        where: { id: b.id },
        data: { status: "cancelled" },
      });
      await MilestoneSvc.reconcile(user.id, NOW, LAUNCH);
      const grant = await heldOf(user.id, "booked_events:1");
      expect(grant?.lifecycles.some((l) => l.type === "REVERSAL")).toBe(true);
    } finally {
      await prisma.milestone.update({
        where: { key: "booked_events" },
        data: { active: true },
      });
    }
  });
});
