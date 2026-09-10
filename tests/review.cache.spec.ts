import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The review reads, and the four writes that retire them.
 *
 * Reviews are the heaviest read in §2c: every venue, event and listing page
 * pulls them, and the listing read computes a rating distribution across the
 * whole set. The keys carry an entity id, a target type, a user id and an
 * `includeReplies` flag, so they cannot be enumerated from a write that knows
 * one review id - which is why the namespace is versioned rather than named.
 *
 * What is pinned here is the pair of properties that makes that safe: a repeat
 * read is served from the cache, and **each of the four write paths bumps the
 * version**, so the next read of anything in the namespace misses and refills.
 * A new write on this service that does not retire the cache should fail this
 * file rather than serve someone a review that is no longer there.
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
      del: vi.fn(async () => 1),
    },
  };
});

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => redis.client },
}));

/** The repository is the thing being cached; what it returns does not matter. */
const repo = vi.hoisted(() => ({
  getAllReviews: vi.fn(async () => [{ id: "r1" }]),
  getReviewById: vi.fn(async () => ({ id: "r1" })),
  getVenueReviews: vi.fn(async () => [{ id: "r1" }]),
  getEventReviews: vi.fn(async () => [{ id: "r1" }]),
  findByTarget: vi.fn(async () => [{ id: "r1" }]),
  getListingReviewsWithDistribution: vi.fn(async () => ({ reviews: [] })),
  getRecentActivity: vi.fn(async () => [{ id: "r1" }]),
  getUserReviews: vi.fn(async () => [{ id: "r1" }]),
  createReview: vi.fn(async () => ({ id: "r1", rating: 5 })),
  createReply: vi.fn(async () => ({ id: "rep1" })),
  updateReview: vi.fn(async () => ({ id: "r1" })),
  deleteReview: vi.fn(async () => ({ id: "r1" })),
}));

vi.mock("../src/modules/review/review.repository", () => ({ default: repo }));

vi.mock("../src/modules/booking/booking.repository", () => ({
  default: { setHasReview: vi.fn(async () => ({})) },
}));

const db = vi.hoisted(() => ({
  review: {
    findUnique: vi.fn(async () => ({
      id: "r1",
      userId: "u1",
      entityId: "v1",
      entityType: "venue",
    })),
    // `createReview` refuses a second review on the same booking.
    findFirst: vi.fn(async () => null),
  },
  venue: { findUnique: vi.fn(async () => ({ mayorId: "u1" })) },
  event: { findUnique: vi.fn(async () => ({ organizerId: "u1" })) },
  booking: {
    // Owned by the reviewer and already finished, which is the only state
    // `createReview` accepts.
    findUnique: vi.fn(async () => ({
      id: "b1",
      userId: "u1",
      status: "confirmed",
      event: { venueTransactions: [] },
    })),
  },
}));

vi.mock("../src/utils/prisma", () => ({ prisma: db }));

import ReviewSvc from "../src/modules/review/review.service";

const VERSION_KEY = "cache:version:review";

beforeEach(() => {
  redis.store.clear();
  vi.clearAllMocks();
});

describe("the review reads are cached", () => {
  it("fills on the first read and serves the second from Redis", async () => {
    await ReviewSvc.getVenueReviews("v1");
    await ReviewSvc.getVenueReviews("v1");

    expect(repo.getVenueReviews).toHaveBeenCalledTimes(1);
  });

  it("keys on the entity, so another venue is a different entry", async () => {
    await ReviewSvc.getVenueReviews("v1");
    await ReviewSvc.getVenueReviews("v2");

    expect(repo.getVenueReviews).toHaveBeenCalledTimes(2);
  });

  /**
   * `includeReplies` changes the payload, not just the query, so it has to be
   * part of the key. Leaving it out would serve a reply-less list to a caller
   * that asked for replies.
   */
  it("keys on includeReplies", async () => {
    await ReviewSvc.getVenueReviews("v1", false);
    await ReviewSvc.getVenueReviews("v1", true);

    expect(repo.getVenueReviews).toHaveBeenCalledTimes(2);
  });

  it("caches all eight reads", async () => {
    const reads: [string, () => Promise<unknown>][] = [
      ["getAllReviews", () => ReviewSvc.getAllReviews()],
      ["getReviewById", () => ReviewSvc.getReviewById("r1")],
      ["getVenueReviews", () => ReviewSvc.getVenueReviews("v1")],
      ["getEventReviews", () => ReviewSvc.getEventReviews("e1")],
      ["getReviewsByTarget", () => ReviewSvc.getReviewsByTarget("t1", "venue")],
      ["getListingReviews", () => ReviewSvc.getListingReviews("l1")],
      ["getRecentActivity", () => ReviewSvc.getRecentActivity(5)],
      ["getUserReviews", () => ReviewSvc.getUserReviews("u1")],
    ];

    for (const [name, call] of reads) {
      redis.store.clear();
      vi.clearAllMocks();
      await call();
      const written = [...redis.store.keys()].filter((k) =>
        k.startsWith("cache:review:"),
      );
      expect(written, `${name} wrote no cache entry`).toHaveLength(1);
    }
  });
});

describe("every write retires the namespace", () => {
  const writes: [string, () => Promise<unknown>][] = [
    [
      "createReview",
      () =>
        ReviewSvc.createReview({
          userId: "u1",
          bookingId: "b1",
          entityId: "v1",
          entityType: "venue",
          rating: 5,
        }),
    ],
    ["replyToReview", () => ReviewSvc.replyToReview("r1", "u1", "thanks")],
    [
      "updateReview",
      () =>
        ReviewSvc.updateReview({
          id: "r1",
          requesterId: "u1",
          data: { rating: 4 },
        }),
    ],
    [
      "deleteReview",
      () => ReviewSvc.deleteReview({ id: "r1", requesterId: "u1" }),
    ],
  ];

  for (const [name, call] of writes) {
    it(`${name} bumps the version`, async () => {
      redis.store.clear();
      vi.clearAllMocks();

      await call();

      expect(
        redis.store.get(VERSION_KEY),
        `${name} did not retire the cached reads`,
      ).toBe("1");
    });
  }

  it("the bump makes the next read miss and refill", async () => {
    await ReviewSvc.getVenueReviews("v1");
    expect(repo.getVenueReviews).toHaveBeenCalledTimes(1);

    await ReviewSvc.updateReview({
      id: "r1",
      requesterId: "u1",
      data: { rating: 4 },
    });

    await ReviewSvc.getVenueReviews("v1");
    expect(repo.getVenueReviews).toHaveBeenCalledTimes(2);
  });
});

/**
 * The authorization check must never be answered from the cache. It reads
 * `prisma.review` directly for exactly that reason: a stale `userId` would
 * decide who may rewrite a review, and `rating` feeds a specialization badge
 * that is never revoked.
 */
describe("authorization does not read through the cache", () => {
  it("asks the database who wrote the review, every time", async () => {
    await ReviewSvc.updateReview({
      id: "r1",
      requesterId: "u1",
      data: { rating: 4 },
    });
    await ReviewSvc.updateReview({
      id: "r1",
      requesterId: "u1",
      data: { rating: 3 },
    });

    expect(db.review.findUnique).toHaveBeenCalledTimes(2);
  });

  it("refuses a requester who is neither the author nor an admin", async () => {
    await expect(
      ReviewSvc.updateReview({
        id: "r1",
        requesterId: "someone-else",
        data: { rating: 1 },
      }),
    ).rejects.toThrow("Unauthorized");
  });
});
