import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Bookings are the most closely watched rows in the product: a guest pays and
 * looks straight at the booking, so a cache that is merely eventually right is
 * a cache that gets someone to pay twice.
 *
 * These reads therefore hang off a version counter that every write bumps -
 * including the writes in payment, refund, review and match, which is why the
 * namespace lives in `utils/cache-namespaces` rather than in the service. What
 * is pinned here is the part that has to hold: a write retires the reads, the
 * per-user keys do not bleed into each other, the expiry sweep still runs on a
 * cache hit, and a cached booking comes back as JSON rather than as Prisma
 * types.
 */

const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    client: {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
        return "OK";
      }),
      incr: vi.fn(async (k: string) => {
        const next = Number(store.get(k) ?? "0") + 1;
        store.set(k, String(next));
        return next;
      }),
      del: vi.fn(async (keys: string[]) => {
        keys.forEach((k) => store.delete(k));
        return keys.length;
      }),
    },
  };
});

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => redis.client },
}));

const repo = vi.hoisted(() => ({
  findByUserId: vi.fn(),
  findUpcomingByUserId: vi.fn(async () => []),
  findById: vi.fn(),
  findBookedStartsByTemplate: vi.fn(async () => []),
  confirmArrival: vi.fn(),
}));

vi.mock("../src/modules/booking/booking.repository", () => ({ default: repo }));

// The expiry sweep moved behind `PaymentSvc` so that the invalidation it needs
// has somewhere to live - it cancels bookings on the way into a read.
const payments = vi.hoisted(() => ({ sweepExpiredPayments: vi.fn() }));

vi.mock("../src/modules/payment/payment.service", () => ({
  default: payments,
}));
vi.mock("../src/modules/payout/payout.service", () => ({ default: class {} }));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceToUser: vi.fn(),
  announceToAdmins: vi.fn(),
}));

import BookingSvc from "../src/modules/booking/booking.service";

const BOOKING = {
  id: "b1",
  userId: "u1",
  status: "confirmed",
  startAt: new Date("2026-09-09T10:00:00.000Z"),
  totalAmount: new Prisma.Decimal("100.50"),
  attendees: [],
  event: { organizerId: "h1", host: { id: "h1" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  redis.store.clear();
  repo.findByUserId.mockImplementation(async (userId: string) => ({
    bookings: [{ ...BOOKING, userId }],
    total: 1,
  }));
  repo.findById.mockResolvedValue(BOOKING);
  repo.confirmArrival.mockResolvedValue({ ...BOOKING, status: "active" });
});

describe("a citizen's own bookings", () => {
  it("queries once, then serves the second load from cache", async () => {
    await BookingSvc.getUserBookings("u1", 1, 10);
    await BookingSvc.getUserBookings("u1", 1, 10);

    expect(repo.findByUserId).toHaveBeenCalledTimes(1);
  });

  it("keeps one citizen's page out of another's", async () => {
    const mine = await BookingSvc.getUserBookings("u1", 1, 10);
    const theirs = await BookingSvc.getUserBookings("u2", 1, 10);

    expect(mine.bookings[0].userId).toBe("u1");
    expect(theirs.bookings[0].userId).toBe("u2");
    expect(repo.findByUserId).toHaveBeenCalledTimes(2);
  });

  it("keeps the pages apart", async () => {
    await BookingSvc.getUserBookings("u1", 1, 10);
    await BookingSvc.getUserBookings("u1", 2, 10);

    expect(repo.findByUserId).toHaveBeenCalledTimes(2);
  });
});

/**
 * The repository is mocked in this file, and the repository is where a write
 * now retires the cache - so what a *write* does is pinned in
 * `booking.invalidation.spec.ts` instead, against the real repositories. What
 * is left here is the other half: that a retire, however it happens, reaches
 * every one of these keys at once.
 */
describe("retiring the cache", () => {
  it("clears the lists without having to name their keys", async () => {
    await BookingSvc.getUserBookings("u1", 1, 10);
    await BookingSvc.getUpcomingBookings("u1");

    await BookingSvc.invalidateCaches();

    await BookingSvc.getUserBookings("u1", 1, 10);
    await BookingSvc.getUpcomingBookings("u1");

    expect(repo.findByUserId).toHaveBeenCalledTimes(2);
    expect(repo.findUpcomingByUserId).toHaveBeenCalledTimes(2);
  });

  it("clears the single booking too", async () => {
    await BookingSvc.getBookingById("b1");
    await BookingSvc.invalidateCaches();
    await BookingSvc.getBookingById("b1");

    expect(repo.findById).toHaveBeenCalledTimes(2);
  });
});

describe("the booking page", () => {
  it("still expires stale payments on a cache hit", async () => {
    // The sweep is a write and sits outside the cache on purpose: skipping it
    // would leave expired payments pending for as long as the entry lived.
    await BookingSvc.getBookingById("b1");
    await BookingSvc.getBookingById("b1");

    expect(repo.findById).toHaveBeenCalledTimes(1);
    expect(payments.sweepExpiredPayments).toHaveBeenCalledTimes(2);
  });

  it("comes back as JSON rather than as Prisma types", async () => {
    // `booking.controller.ts` called `startAt.toISOString()` on this value,
    // inside a try that would have reported the TypeError as a failed
    // confirmation email.
    const booking = await BookingSvc.getBookingById("b1");

    expect(booking.startAt).toBe("2026-09-09T10:00:00.000Z");
    expect(booking.totalAmount).toBe("100.5");
  });
});

describe("template availability", () => {
  it("collapses the booked start times to one date each, and caches it", async () => {
    repo.findBookedStartsByTemplate.mockResolvedValue([
      { startAt: new Date("2026-09-09T10:00:00.000Z") },
      { startAt: new Date("2026-09-09T18:00:00.000Z") },
      { startAt: new Date("2026-09-11T10:00:00.000Z") },
    ]);

    const first = await BookingSvc.getAvailability("t1");
    const second = await BookingSvc.getAvailability("t1");

    expect(first.bookedDates).toEqual(["2026-09-09", "2026-09-11"]);
    expect(second.bookedDates).toEqual(first.bookedDates);
    expect(repo.findBookedStartsByTemplate).toHaveBeenCalledTimes(1);
  });

  it("is cleared by a booking, not left to its five minutes", async () => {
    await BookingSvc.getAvailability("t1");
    await BookingSvc.invalidateCaches();
    await BookingSvc.getAvailability("t1");

    expect(repo.findBookedStartsByTemplate).toHaveBeenCalledTimes(2);
  });
});
