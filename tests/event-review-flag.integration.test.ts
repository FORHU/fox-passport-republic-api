import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/utils/prisma";
import EventRequestRepo from "../src/modules/event-request/event-request.repository";
import BookingRepo from "../src/modules/booking/booking.repository";

/**
 * Which Events the daily sweep flags for review: ended, with at least one
 * booking still standing and none checked in, not already settled or flagged.
 */
describe("EventRequestRepo.findUnattendedPast / claimReviewFlag", () => {
  const runId = Math.random().toString(36).substring(7);
  const now = new Date("2027-03-10T00:00:00.000Z");
  const past = {
    startAt: new Date("2027-03-01T00:00:00.000Z"),
    endAt: new Date("2027-03-02T00:00:00.000Z"),
  };
  const future = {
    startAt: new Date("2027-04-01T00:00:00.000Z"),
    endAt: new Date("2027-04-02T00:00:00.000Z"),
  };
  let userId: string;
  const ids: Record<string, string> = {};
  const bookingIds: Record<string, string[]> = {};

  const makeEvent = async (
    key: string,
    when: typeof past,
    bookings: { status?: "confirmed" | "cancelled"; checkedIn?: boolean }[],
    extra: { eventStatus?: "completed"; reviewFlaggedAt?: Date } = {},
  ) => {
    const event = await prisma.event.create({
      data: {
        clientId: userId,
        organizerId: userId,
        name: `Review ${key} ${runId}`,
        description: "desc",
        eventCategory: "corporate",
        guestCount: 10,
        totalAmount: 1000,
        ...when,
        ...extra,
      },
    });
    bookingIds[key] = [];
    for (const b of bookings) {
      const booking = await prisma.booking.create({
        data: {
          eventId: event.id,
          userId,
          guestCount: 2,
          totalAmount: 500,
          ...when,
          status: b.status ?? "confirmed",
          checkedIn: b.checkedIn ?? false,
        },
      });
      bookingIds[key].push(booking.id);
    }
    ids[key] = event.id;
  };

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `review_${runId}@test.com`,
        password: "pw",
        name: "Reviewer",
        roleType: ["eventFoxer"],
      },
    });
    userId = user.id;

    await makeEvent("unattended", past, [{}, { status: "cancelled" }]);
    await makeEvent("checkedIn", past, [{}, { checkedIn: true }]);
    await makeEvent("allCancelled", past, [{ status: "cancelled" }]);
    await makeEvent("noBookings", past, []);
    await makeEvent("notEnded", future, [{}]);
    await makeEvent("completed", past, [{}], { eventStatus: "completed" });
    await makeEvent("flagged", past, [{}], { reviewFlaggedAt: now });
  });

  afterAll(async () => {
    const eventIds = Object.values(ids);
    await prisma.booking.deleteMany({ where: { eventId: { in: eventIds } } });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("finds only the ended Event with a standing booking and no check-in", async () => {
    const found = (await EventRequestRepo.findUnattendedPast(now))
      .map((e) => e.id)
      .filter((id) => Object.values(ids).includes(id));
    expect(found).toEqual([ids.unattended]);
  });

  it("claims the flag once", async () => {
    expect(await EventRequestRepo.claimReviewFlag(ids.unattended, now)).toBe(
      true,
    );
    expect(await EventRequestRepo.claimReviewFlag(ids.unattended, now)).toBe(
      false,
    );
  });

  it("lists flagged, unsettled Events for review", async () => {
    const listed = (await EventRequestRepo.findNeedingReview()).map(
      (e) => e.id,
    );
    expect(listed).toEqual(
      expect.arrayContaining([ids.unattended, ids.flagged]),
    );
    expect(listed).not.toContain(ids.completed);
  });

  it("settles a booking once, and only while it is open", async () => {
    const [open] = bookingIds.flagged;
    expect(await BookingRepo.settleForReview(open, true)).toBe(true);
    expect(await BookingRepo.settleForReview(open, true)).toBe(false);
    expect(await BookingRepo.settleForReview(open, false)).toBe(false);
    const row = await prisma.booking.findUnique({ where: { id: open } });
    expect(row).toMatchObject({ status: "completed", checkedIn: true });
  });
});
