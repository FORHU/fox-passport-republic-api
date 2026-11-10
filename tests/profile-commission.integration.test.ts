import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "../src/utils/prisma";
import ProfileSvc from "../src/modules/profile/profile.service";
import { eventTemplateCache } from "../src/utils/cache-namespaces";

/**
 * #264 T5 against a real database: setting the EventFoxer's rate changes only
 * `users.commissionPct`, never a booked Event's own rate, and lists the
 * upcoming booked Events that keep theirs. Cancelled-only and past Events
 * aren't listed. It writes an audit entry only when the rate changes.
 * Scoped to the rows this spec creates, and deletes only those.
 */
describe("ProfileSvc commission (database)", () => {
  const runId = Math.random().toString(36).substring(7);
  let foxerId = "";
  let clientId = "";
  const eventIds: Record<string, string> = {};
  const DAY = 86_400_000;

  const makeEvent = async (
    key: string,
    endInDays: number,
    commissionPct: number | null,
    bookingStatus: "confirmed" | "cancelled" | null,
  ) => {
    const start = new Date(Date.now() + (endInDays - 1) * DAY);
    const end = new Date(Date.now() + endInDays * DAY);
    const event = await prisma.event.create({
      data: {
        clientId,
        organizerId: foxerId,
        name: `Commission ${key} ${runId}`,
        description: "desc",
        eventCategory: "corporate",
        startAt: start,
        endAt: end,
        guestCount: 5,
        totalAmount: 1000,
        commissionPct,
      },
    });
    eventIds[key] = event.id;
    if (bookingStatus) {
      await prisma.booking.create({
        data: {
          eventId: event.id,
          userId: clientId,
          guestCount: 5,
          totalAmount: 1000,
          status: bookingStatus,
          startAt: start,
          endAt: end,
        },
      });
    }
  };

  const actor = () => ({
    userId: foxerId,
    email: `commission-foxer-${runId}@example.com`,
  });

  beforeAll(async () => {
    foxerId = (
      await prisma.user.create({
        data: {
          email: `commission-foxer-${runId}@example.com`,
          name: `Commission foxer ${runId}`,
          roleType: ["eventFoxer"],
          commissionPct: 10,
        },
      })
    ).id;
    clientId = (
      await prisma.user.create({
        data: {
          email: `commission-client-${runId}@example.com`,
          name: `Commission client ${runId}`,
        },
      })
    ).id;

    await makeEvent("booked", 7, 10, "confirmed");
    await makeEvent("bookedBeforeRates", 8, null, "confirmed");
    await makeEvent("unbooked", 9, null, null);
    await makeEvent("cancelledOnly", 10, 10, "cancelled");
    await makeEvent("past", -3, 10, "confirmed");
  });

  afterAll(async () => {
    const ids = Object.values(eventIds);
    await prisma.booking.deleteMany({ where: { eventId: { in: ids } } });
    await prisma.event.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { targetId: foxerId } });
    await prisma.user.deleteMany({
      where: { id: { in: [foxerId, clientId] } },
    });
  });

  it("reads the rate", async () => {
    await expect(ProfileSvc.getCommission(foxerId)).resolves.toEqual({
      commissionPct: 10,
    });
  });

  it("sets the rate, leaves booked Events' rates alone, and lists them", async () => {
    const result = await ProfileSvc.setCommission(foxerId, 15, actor());

    expect(result.commissionPct).toBe(15);
    expect(result.previousCommissionPct).toBe(10);
    expect(result.eventsKeepingTheirRate.map((e) => e.id)).toEqual([
      eventIds.booked,
      eventIds.bookedBeforeRates,
    ]);
    expect(result.eventsKeepingTheirRate[0].commissionPct).toBe(10);
    expect(result.eventsKeepingTheirRate[1].commissionPct).toBeNull();

    const booked = await prisma.event.findUniqueOrThrow({
      where: { id: eventIds.booked },
      select: { commissionPct: true },
    });
    expect(booked.commissionPct?.toNumber()).toBe(10);
    await expect(ProfileSvc.getCommission(foxerId)).resolves.toEqual({
      commissionPct: 15,
    });
  });

  it("records the change in the audit log, and nothing when the rate is unchanged", async () => {
    const before = await prisma.auditLog.count({
      where: { targetId: foxerId, action: "commission.update" },
    });
    await ProfileSvc.setCommission(foxerId, 15, actor());
    await ProfileSvc.setCommission(foxerId, 20, actor());
    const entries = await prisma.auditLog.findMany({
      where: { targetId: foxerId, action: "commission.update" },
      orderBy: { createdAt: "desc" },
    });

    expect(entries.length).toBe(before + 1);
    expect(entries[0].metadata).toMatchObject({
      previous: { commissionPct: 15 },
      current: { commissionPct: 20 },
    });
  });

  it("clears the template cache, so previews and bookings use the new rate at once", async () => {
    const clear = vi.spyOn(eventTemplateCache, "invalidateAll");
    await ProfileSvc.setCommission(foxerId, 25, actor());
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });

  it("answers 404 for a user that doesn't exist", async () => {
    await expect(
      ProfileSvc.setCommission(
        "00000000-0000-4000-8000-000000000000",
        10,
        actor(),
      ),
    ).rejects.toThrow(/User not found/);
  });
});
