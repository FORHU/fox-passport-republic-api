import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUniqueReview = vi.fn();
const mockFindFirstReview = vi.fn();
const mockFindManyReview = vi.fn();
const mockGroupByReview = vi.fn();
const mockAggregateReview = vi.fn();
const mockCreateReview = vi.fn();
const mockUpdateReview = vi.fn();

const mockFindUniqueVote = vi.fn();
const mockCreateVote = vi.fn();
const mockDeleteVote = vi.fn();

const mockFindUniqueBooking = vi.fn();
const mockGrant = vi.fn();

vi.mock("../src/utils/prisma", () => {
  const txClient = {
    reviewHelpfulVote: {
      create: (...args: unknown[]) => mockCreateVote(...args),
      delete: (...args: unknown[]) => mockDeleteVote(...args),
    },
    review: {
      update: (...args: unknown[]) => mockUpdateReview(...args),
    },
  };
  return {
    prisma: {
      review: {
        findUnique: (...args: unknown[]) => mockFindUniqueReview(...args),
        findFirst: (...args: unknown[]) => mockFindFirstReview(...args),
        findMany: (...args: unknown[]) => mockFindManyReview(...args),
        groupBy: (...args: unknown[]) => mockGroupByReview(...args),
        aggregate: (...args: unknown[]) => mockAggregateReview(...args),
        create: (...args: unknown[]) => mockCreateReview(...args),
        update: (...args: unknown[]) => mockUpdateReview(...args),
        count: vi.fn(async () => 2),
      },
      reviewHelpfulVote: {
        findUnique: (...args: unknown[]) => mockFindUniqueVote(...args),
        create: (...args: unknown[]) => mockCreateVote(...args),
        delete: (...args: unknown[]) => mockDeleteVote(...args),
      },
      booking: {
        findUnique: (...args: unknown[]) => mockFindUniqueBooking(...args),
      },
      $transaction: vi.fn(
        async (cb: (tx: typeof txClient) => Promise<unknown>) => cb(txClient),
      ),
    },
  };
});

vi.mock("../src/modules/booking/booking.repository", () => ({
  default: { setHasReview: vi.fn(async () => ({})) },
}));

vi.mock("../src/modules/reward/reward.service", () => ({
  default: {
    grant: (...args: unknown[]) => mockGrant(...args),
  },
}));

vi.mock("../src/modules/passport/passport.service", () => ({
  default: { awardBadgeByName: vi.fn(async () => ({})) },
  UserPath: {
    user: "user",
    venueFoxer: "venue_foxer",
    eventFoxer: "event_foxer",
    providerFoxer: "provider_foxer",
  },
}));

import ReviewSvc from "../src/modules/review/review.service";
import ReviewRepo from "../src/modules/review/review.repository";

describe("Review Sub-Ratings, Helpful Votes & Reviewer XP (§9.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUniqueBooking.mockResolvedValue({
      id: "booking-1",
      userId: "author-1",
      status: "completed",
      checkedIn: true,
      event: { venueTransactions: [] },
    });
    mockFindFirstReview.mockResolvedValue(null);
  });

  describe("Sub-Ratings on Reviews", () => {
    it("creates a review with optional 1–5 sub-ratings (quality, communication, value, punctuality)", async () => {
      mockCreateReview.mockImplementation(async ({ data }) => ({
        id: "rev-101",
        ...data,
        helpfulCount: 0,
      }));

      const created = await ReviewSvc.createReview({
        userId: "author-1",
        bookingId: "booking-1",
        entityId: "venue-1",
        entityType: "venue",
        rating: 5,
        comment: "Fantastic experience!",
        quality: 5,
        communication: 4,
        value: 5,
        punctuality: 5,
      });

      expect(created).toMatchObject({
        id: "rev-101",
        rating: 5,
        quality: 5,
        communication: 4,
        value: 5,
        punctuality: 5,
      });
      expect(mockCreateReview).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quality: 5,
            communication: 4,
            value: 5,
            punctuality: 5,
          }),
        }),
      );
    });

    it("rejects out-of-range sub-ratings (< 1 or > 5)", async () => {
      await expect(
        ReviewSvc.createReview({
          userId: "author-1",
          bookingId: "booking-1",
          entityId: "venue-1",
          entityType: "venue",
          rating: 4,
          quality: 6,
        }),
      ).rejects.toThrow("quality rating must be an integer between 1 and 5");

      await expect(
        ReviewSvc.createReview({
          userId: "author-1",
          bookingId: "booking-1",
          entityId: "venue-1",
          entityType: "venue",
          rating: 4,
          punctuality: 0,
        }),
      ).rejects.toThrow(
        "punctuality rating must be an integer between 1 and 5",
      );
    });

    it("computes subRatingAverages alongside ratingDistribution for listing reviews", async () => {
      mockFindManyReview.mockResolvedValue([
        {
          id: "rev-1",
          rating: 5,
          quality: 5,
          communication: 4,
          value: 5,
          punctuality: 5,
          helpfulCount: 3,
        },
      ]);
      mockGroupByReview.mockResolvedValue([{ rating: 5, _count: { _all: 2 } }]);
      mockAggregateReview.mockResolvedValue({
        _avg: {
          quality: 4.5,
          communication: 4.25,
          value: 4.8,
          punctuality: 5.0,
        },
      });

      const result = await ReviewRepo.getListingReviewsWithDistribution(
        "venue-1",
        false,
        200,
        "most_helpful",
      );

      expect(result.ratingDistribution[5]).toBe("100%");
      expect(result.subRatingAverages).toEqual({
        quality: 4.5,
        communication: 4.3,
        value: 4.8,
        punctuality: 5,
      });
      expect(mockFindManyReview).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ helpfulCount: "desc" }, { createdAt: "desc" }],
        }),
      );
    });
  });

  describe("Helpful Votes & Reviewer XP Grant", () => {
    it("blocks a user from voting their own review as helpful", async () => {
      mockFindUniqueReview.mockResolvedValue({
        id: "rev-1",
        userId: "author-1",
        helpfulCount: 0,
      });

      await expect(
        ReviewSvc.toggleHelpfulVote("rev-1", "author-1"),
      ).rejects.toThrow("You cannot mark your own review as helpful");

      expect(mockCreateVote).not.toHaveBeenCalled();
      expect(mockGrant).not.toHaveBeenCalled();
    });

    it("adds a helpful vote, increments helpfulCount, and grants +2 XP (0 Coins) to the review author", async () => {
      mockFindUniqueReview.mockResolvedValue({
        id: "rev-1",
        userId: "author-1",
        helpfulCount: 2,
      });
      mockFindUniqueVote.mockResolvedValue(null);
      mockCreateVote.mockResolvedValue({ id: "vote-1" });
      mockUpdateReview.mockResolvedValue({
        id: "rev-1",
        userId: "author-1",
        helpfulCount: 3,
      });
      mockGrant.mockResolvedValue({
        xpAwarded: 2,
        coinsAwarded: 0,
        newLevel: 1,
        newRank: "Newcomer",
        isIdempotentReplay: false,
      });

      const res = await ReviewSvc.toggleHelpfulVote("rev-1", "voter-99");

      expect(res).toEqual({
        helpful: true,
        helpfulCount: 3,
        xpAwarded: 2,
      });
      expect(mockCreateVote).toHaveBeenCalledWith({
        data: { reviewId: "rev-1", userId: "voter-99" },
      });
      expect(mockGrant).toHaveBeenCalledWith({
        userId: "author-1",
        path: "user",
        action: "review_helpful",
        refType: "review_helpful",
        refId: "rev-1:voter-99",
        idempotencyKey: "grant:author-1:review_helpful:rev-1:voter-99",
        xpOverride: 2,
        coinsOverride: 0,
      });
    });

    it("removes an existing helpful vote on toggle off without granting XP", async () => {
      mockFindUniqueReview.mockResolvedValue({
        id: "rev-1",
        userId: "author-1",
        helpfulCount: 3,
      });
      mockFindUniqueVote.mockResolvedValue({
        id: "vote-1",
        reviewId: "rev-1",
        userId: "voter-99",
      });
      mockDeleteVote.mockResolvedValue({ id: "vote-1" });
      mockUpdateReview.mockResolvedValue({
        id: "rev-1",
        userId: "author-1",
        helpfulCount: 2,
      });

      const res = await ReviewSvc.toggleHelpfulVote("rev-1", "voter-99");

      expect(res).toEqual({
        helpful: false,
        helpfulCount: 2,
        xpAwarded: 0,
      });
      expect(mockDeleteVote).toHaveBeenCalled();
      expect(mockGrant).not.toHaveBeenCalled();
    });

    it("does not farm extra XP when a voter unvotes and re-votes (idempotent replay) or when daily cap is reached", async () => {
      mockFindUniqueReview.mockResolvedValue({
        id: "rev-1",
        userId: "author-1",
        helpfulCount: 2,
      });
      mockFindUniqueVote.mockResolvedValue(null);
      mockCreateVote.mockResolvedValue({ id: "vote-2" });
      mockUpdateReview.mockResolvedValue({
        id: "rev-1",
        userId: "author-1",
        helpfulCount: 3,
      });
      mockGrant.mockResolvedValue({
        xpAwarded: 2,
        coinsAwarded: 0,
        newLevel: 1,
        newRank: "Newcomer",
        isIdempotentReplay: true,
      });

      const replayRes = await ReviewSvc.toggleHelpfulVote("rev-1", "voter-99");
      expect(replayRes.xpAwarded).toBe(0);

      mockGrant.mockResolvedValue({
        xpAwarded: 0,
        coinsAwarded: 0,
        newLevel: 1,
        newRank: "Newcomer",
        isIdempotentReplay: false,
      });

      const cappedRes = await ReviewSvc.toggleHelpfulVote("rev-1", "voter-100");
      expect(cappedRes.xpAwarded).toBe(0);
    });
  });

  describe("Review Sorting", () => {
    it("supports sorting by most_helpful, recent, highest, and lowest", async () => {
      mockFindManyReview.mockResolvedValue([]);

      await ReviewRepo.findByTarget(
        "venue-1",
        "venue",
        false,
        200,
        "most_helpful",
      );
      expect(mockFindManyReview).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderBy: [{ helpfulCount: "desc" }, { createdAt: "desc" }],
        }),
      );

      await ReviewRepo.findByTarget("venue-1", "venue", false, 200, "highest");
      expect(mockFindManyReview).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
        }),
      );

      await ReviewRepo.findByTarget("venue-1", "venue", false, 200, "lowest");
      expect(mockFindManyReview).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderBy: [{ rating: "asc" }, { createdAt: "desc" }],
        }),
      );

      await ReviewRepo.findByTarget("venue-1", "venue", false, 200, "recent");
      expect(mockFindManyReview).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderBy: [{ createdAt: "desc" }],
        }),
      );
    });
  });
});
