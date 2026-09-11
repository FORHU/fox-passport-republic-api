import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A review traces to a stay, or it does not exist.
 *
 * `bookingId` used to be optional. The branch that handled its absence took
 * **the most recently created event in the entire system** and fabricated a
 * confirmed booking against it — a real row, with a real user id, in the
 * bookings table — so the review had something to hang off. The reviewer had
 * not been there; the booking had never happened; and it counted as a booking
 * from then on, in every list and every count that reads that table.
 *
 * That was recorded as a flag rather than fixed during the caching pass,
 * because which way it should go is a product question and not a caching one.
 * This file is the answer: the booking is required, and nothing is invented.
 *
 * What is pinned here is mostly the *absence* of a behaviour, which is the kind
 * that comes back. If `createReview` ever creates a booking again, the last
 * test in this file fails.
 */

const db = vi.hoisted(() => ({
  booking: {
    findUnique: vi.fn(async () => ({
      id: "b1",
      userId: "u1",
      status: "confirmed",
      event: { venueTransactions: [] },
    })),
  },
  review: {
    findFirst: vi.fn(async () => null),
    findUnique: vi.fn(async () => null),
  },
  event: { findFirst: vi.fn(async () => ({ id: "e-newest" })) },
  passport: { findUnique: vi.fn(async () => null) },
}));

vi.mock("../src/utils/prisma", () => ({ prisma: db }));

const repo = vi.hoisted(() => ({
  createReview: vi.fn(async () => ({ id: "r1", rating: 5 })),
}));
vi.mock("../src/modules/review/review.repository", () => ({ default: repo }));

const bookingRepo = vi.hoisted(() => ({
  setHasReview: vi.fn(async () => ({})),
  createWithIds: vi.fn(async () => ({ id: "fabricated" })),
}));
vi.mock("../src/modules/booking/booking.repository", () => ({
  default: bookingRepo,
}));

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => null },
}));

import ReviewSvc from "../src/modules/review/review.service";

const VALID = {
  userId: "u1",
  bookingId: "b1",
  entityId: "v1",
  entityType: "venue",
  rating: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.booking.findUnique.mockResolvedValue({
    id: "b1",
    userId: "u1",
    status: "confirmed",
    event: { venueTransactions: [] },
  });
  db.review.findFirst.mockResolvedValue(null);
});

describe("a review must name its booking", () => {
  it("refuses a review with no bookingId", async () => {
    await expect(
      ReviewSvc.createReview({ ...VALID, bookingId: "" }),
    ).rejects.toThrow(/bookingId is required/i);
  });

  it("refuses one with bookingId left undefined", async () => {
    await expect(
      ReviewSvc.createReview({
        ...VALID,
        bookingId: undefined as unknown as string,
      }),
    ).rejects.toThrow(/bookingId is required/i);
  });

  /**
   * The point of the whole change: the old code answered a missing booking by
   * writing one. Nothing in this path may create a booking.
   */
  it("never fabricates a booking to hang the review off", async () => {
    await expect(
      ReviewSvc.createReview({ ...VALID, bookingId: "" }),
    ).rejects.toThrow();

    expect(bookingRepo.createWithIds).not.toHaveBeenCalled();
    expect(db.event.findFirst).not.toHaveBeenCalled();
    expect(repo.createReview).not.toHaveBeenCalled();
  });
});

describe("the checks that were already there still hold", () => {
  it("accepts a review on the reviewer's own finished booking", async () => {
    const review = await ReviewSvc.createReview(VALID);

    expect(review).toEqual({ id: "r1", rating: 5 });
    expect(repo.createReview).toHaveBeenCalledOnce();
    expect(bookingRepo.setHasReview).toHaveBeenCalledWith("b1", true);
  });

  it("refuses a booking belonging to somebody else", async () => {
    db.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "someone-else",
      status: "confirmed",
      event: { venueTransactions: [] },
    });

    await expect(ReviewSvc.createReview(VALID)).rejects.toThrow(
      /does not belong to you/i,
    );
  });

  it("refuses a booking that has not happened yet", async () => {
    db.booking.findUnique.mockResolvedValue({
      id: "b1",
      userId: "u1",
      status: "pending",
      event: { venueTransactions: [] },
    });

    await expect(ReviewSvc.createReview(VALID)).rejects.toThrow(
      /pending or cancelled/i,
    );
  });

  it("refuses a second review on the same booking", async () => {
    db.review.findFirst.mockResolvedValue({ id: "existing" });

    await expect(ReviewSvc.createReview(VALID)).rejects.toThrow(
      /already exists/i,
    );
  });

  it("refuses a booking that does not exist", async () => {
    db.booking.findUnique.mockResolvedValue(null);

    await expect(ReviewSvc.createReview(VALID)).rejects.toThrow(
      /Booking not found/i,
    );
  });
});
