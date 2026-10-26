import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * GET /bookings/availability?templateId= closes the days a package can't be
 * booked on, so the date picker (web and mobile) offers only open ones: the
 * package's own bookings, and every day its venue is taken elsewhere or
 * blocked by the venue.
 */

const repo = vi.hoisted(() => ({
  findBookedStartsByTemplate: vi.fn(),
  findVenueTakenByTemplate: vi.fn(),
}));
vi.mock("../src/modules/booking/booking.repository", () => ({ default: repo }));

vi.mock("../src/utils/cache-namespaces", () => ({
  bookingCache: {
    cached: (_key: string, _ttl: number, fn: () => unknown) => fn(),
  },
}));
vi.mock("../src/modules/payout/payout.service", () => ({ default: class {} }));
vi.mock("../src/modules/payment/payment.service", () => ({
  default: class {},
}));

import BookingSvc from "../src/modules/booking/booking.service";

const d = (iso: string) => new Date(iso);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(d("2027-06-01T08:00:00Z"));
  repo.findBookedStartsByTemplate.mockResolvedValue([]);
  repo.findVenueTakenByTemplate.mockResolvedValue({
    ranges: [],
    blockedDates: [],
  });
});
afterEach(() => vi.useRealTimers());

describe("BookingSvc.getAvailability", () => {
  it("closes every day the venue is taken by another booking", async () => {
    repo.findVenueTakenByTemplate.mockResolvedValue({
      ranges: [
        // A two-day festival elsewhere at the same venue.
        {
          startAt: d("2027-06-10T09:00:00Z"),
          endAt: d("2027-06-11T23:00:00Z"),
        },
        // Ends at midnight: the next day stays open.
        {
          startAt: d("2027-06-20T18:00:00Z"),
          endAt: d("2027-06-21T00:00:00Z"),
        },
      ],
      blockedDates: [],
    });
    const { bookedDates } = await BookingSvc.getAvailability("t1");
    expect(bookedDates).toEqual(["2027-06-10", "2027-06-11", "2027-06-20"]);
  });

  it("adds the venue's blocked days and the package's own bookings, once each", async () => {
    repo.findBookedStartsByTemplate.mockResolvedValue([
      { startAt: d("2027-06-05T10:00:00Z") },
    ]);
    repo.findVenueTakenByTemplate.mockResolvedValue({
      ranges: [
        {
          startAt: d("2027-06-05T10:00:00Z"),
          endAt: d("2027-06-05T22:00:00Z"),
        },
      ],
      blockedDates: [d("2027-06-07T00:00:00Z")],
    });
    const { bookedDates } = await BookingSvc.getAvailability("t1");
    expect(bookedDates).toEqual(["2027-06-05", "2027-06-07"]);
  });

  it("leaves out days already past", async () => {
    repo.findVenueTakenByTemplate.mockResolvedValue({
      ranges: [
        {
          startAt: d("2027-05-31T10:00:00Z"),
          endAt: d("2027-06-02T10:00:00Z"),
        },
      ],
      blockedDates: [d("2027-05-20T00:00:00Z")],
    });
    const { bookedDates } = await BookingSvc.getAvailability("t1");
    expect(bookedDates).toEqual(["2027-06-01", "2027-06-02"]);
  });
});
