import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `PUT /reviews/:id` and `DELETE /reviews/:id` required a token but never asked
 * whose, so any authenticated user could rewrite or delete any review by id.
 *
 * These tests pin the author/admin rule and the field allow-list, because the
 * blast radius is not the review text: `rating` feeds the Earned Specialization
 * threshold, and Earned specializations are never revoked.
 */

const review = {
  id: "rev-1",
  userId: "author-1",
  rating: 1,
  comment: "Not great",
};

const findUnique = vi.fn();

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    review: {
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
  },
}));

const updateReview = vi.fn(async (id: string, data: unknown) => ({
  ...review,
  ...(data as object),
  id,
}));
const deleteReview = vi.fn(async (id: string) => ({ id }));

vi.mock("../src/repositories/review.repository", () => ({
  default: {
    updateReview: (...args: [string, unknown]) => updateReview(...args),
    deleteReview: (...args: [string]) => deleteReview(...args),
  },
}));

import ReviewSvc from "../src/services/review.service";

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ id: review.id, userId: review.userId });
});

describe("review mutation authorization", () => {
  it("lets the author edit their own review", async () => {
    await expect(
      ReviewSvc.updateReview({
        id: review.id,
        requesterId: "author-1",
        data: { rating: 4 },
      }),
    ).resolves.toMatchObject({ rating: 4 });

    expect(updateReview).toHaveBeenCalledWith(review.id, { rating: 4 });
  });

  it("refuses a different authenticated user", async () => {
    await expect(
      ReviewSvc.updateReview({
        id: review.id,
        requesterId: "someone-else",
        data: { rating: 5 },
      }),
    ).rejects.toThrow("Unauthorized");

    // The write must not happen at all — not merely be reverted afterwards.
    expect(updateReview).not.toHaveBeenCalled();
  });

  it("refuses a different user deleting a review about them", async () => {
    await expect(
      ReviewSvc.deleteReview({ id: review.id, requesterId: "the-reviewed" }),
    ).rejects.toThrow("Unauthorized");

    expect(deleteReview).not.toHaveBeenCalled();
  });

  it("allows an admin", async () => {
    await expect(
      ReviewSvc.deleteReview({
        id: review.id,
        requesterId: "admin-9",
        requesterRole: "admin",
      }),
    ).resolves.toBeTruthy();

    expect(deleteReview).toHaveBeenCalledWith(review.id);
  });

  it("reports a missing review rather than treating it as forbidden", async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      ReviewSvc.updateReview({
        id: "nope",
        requesterId: "author-1",
        data: { rating: 3 },
      }),
    ).rejects.toThrow("Review not found");
  });

  it("writes only rating and comment, whatever else it is handed", async () => {
    // The repository spreads its `data` straight into prisma.review.update, so
    // an unfiltered body was mass assignment on every column of Review.
    await ReviewSvc.updateReview({
      id: review.id,
      requesterId: "author-1",
      data: {
        rating: 5,
        comment: "Edited",
        // Fields a caller must never be able to set:
        userId: "someone-else",
        entityId: "other-venue",
        createdAt: new Date(0),
      } as never,
    });

    expect(updateReview).toHaveBeenCalledWith(review.id, {
      rating: 5,
      comment: "Edited",
    });
  });
});
