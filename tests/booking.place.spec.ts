import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mobile's Directions button needs to know where the event is. The two ticket
 * reads (`GET /bookings/upcoming` and `GET /bookings/user/:userId`) now return
 * `event.lat` and `event.lng`: the booked venue's spot first, the event
 * template's second, and only for a confirmed booking, because the exact
 * place is not shared before that.
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
  findUpcomingByUserId: vi.fn(),
  findById: vi.fn(),
}));

vi.mock("../src/modules/booking/booking.repository", () => ({ default: repo }));
vi.mock("../src/modules/payment/payment.service", () => ({
  default: { sweepExpiredPayments: vi.fn() },
}));
vi.mock("../src/modules/payout/payout.service", () => ({ default: class {} }));
vi.mock("../src/infrastructure/socket/invalidate", () => ({
  announceToUser: vi.fn(),
  announceToAdmins: vi.fn(),
}));

import BookingSvc from "../src/modules/booking/booking.service";
import { placeOf, withPlace } from "../src/modules/booking/booking.place";

const VENUE = { lat: 14.5764, lng: 121.0851 };
const TEMPLATE = { lat: 10.3157, lng: 123.8854 };

function booking(
  over: {
    status?: string;
    venue?: { lat: number | null; lng: number | null } | null;
    template?: { lat: number | null; lng: number | null } | null;
  } = {},
) {
  const { status = "confirmed", venue = VENUE, template = TEMPLATE } = over;
  return {
    id: "b1",
    userId: "u1",
    status,
    event: { id: "e1", name: "Night", template },
    venueTransactions: venue ? [{ venue }] : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  redis.store.clear();
});

describe("placeOf", () => {
  it("is the booked venue's spot for a confirmed booking", () => {
    expect(placeOf(booking())).toEqual(VENUE);
  });

  it("falls back to the event template when no venue is booked", () => {
    expect(placeOf(booking({ venue: null }))).toEqual(TEMPLATE);
  });

  it("falls back to the template when the venue has no coordinates", () => {
    expect(placeOf(booking({ venue: { lat: null, lng: null } }))).toEqual(
      TEMPLATE,
    );
  });

  it("is null when neither has coordinates", () => {
    expect(placeOf(booking({ venue: null, template: null }))).toEqual({
      lat: null,
      lng: null,
    });
  });

  it("does not use half a place", () => {
    expect(
      placeOf(booking({ venue: { lat: 14.5, lng: null }, template: null })),
    ).toEqual({ lat: null, lng: null });
  });

  it.each(["pending", "cancelled", "completed", "active", "disputed"])(
    "is null for a %s booking, even with a venue",
    (status) => {
      expect(placeOf(booking({ status }))).toEqual({ lat: null, lng: null });
    },
  );
});

describe("withPlace", () => {
  it("puts lat and lng on the event and drops the helper rows", () => {
    const out = withPlace(booking());

    expect(out.event).toEqual({
      id: "e1",
      name: "Night",
      lat: VENUE.lat,
      lng: VENUE.lng,
    });
    expect(out).not.toHaveProperty("venueTransactions");
    expect(out.event).not.toHaveProperty("template");
  });

  it("keeps the rest of the booking as it was", () => {
    const out = withPlace(booking());
    expect(out.id).toBe("b1");
    expect(out.userId).toBe("u1");
    expect(out.status).toBe("confirmed");
  });
});

describe("GET /bookings/upcoming", () => {
  it("carries the coordinates of a confirmed booking", async () => {
    repo.findUpcomingByUserId.mockResolvedValue([booking()]);

    const [first] = await BookingSvc.getUpcomingBookings("u1");

    expect(first.event.lat).toBe(VENUE.lat);
    expect(first.event.lng).toBe(VENUE.lng);
  });

  it("keeps them back while the booking is pending", async () => {
    repo.findUpcomingByUserId.mockResolvedValue([
      booking({ status: "pending" }),
    ]);

    const [first] = await BookingSvc.getUpcomingBookings("u1");

    expect(first.event.lat).toBeNull();
    expect(first.event.lng).toBeNull();
  });

  it("does not serve a pending answer after the booking is confirmed", async () => {
    repo.findUpcomingByUserId.mockResolvedValue([
      booking({ status: "pending" }),
    ]);
    const before = await BookingSvc.getUpcomingBookings("u1");
    expect(before[0].event.lat).toBeNull();

    // Every booking write retires the cached reads.
    await BookingSvc.invalidateCaches();
    repo.findUpcomingByUserId.mockResolvedValue([booking()]);
    const after = await BookingSvc.getUpcomingBookings("u1");

    expect(after[0].event.lat).toBe(VENUE.lat);
  });
});

describe("GET /bookings/user/:userId", () => {
  it("carries the coordinates too, and keeps the total", async () => {
    repo.findByUserId.mockResolvedValue({
      bookings: [booking(), booking({ status: "pending" })],
      total: 7,
    });

    const { bookings, total } = await BookingSvc.getUserBookings("u1", 1, 10);

    expect(total).toBe(7);
    expect(bookings[0].event.lat).toBe(VENUE.lat);
    expect(bookings[1].event.lat).toBeNull();
  });
});
