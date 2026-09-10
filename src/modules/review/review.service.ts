import { prisma } from "../../utils/prisma";
import { versionedCache } from "../../utils/cache.util";
import BookingRepo from "../booking/booking.repository";
import ReviewRepo from "./review.repository";

/**
 * Reviews are read far more often than they are written - every venue page,
 * every event page and every listing pulls them - and the repository reads are
 * the expensive kind: joins onto the author, optional replies, and for a
 * listing a rating distribution computed across the whole set.
 *
 * **Versioned rather than named keys.** These keys carry a venue id, an event
 * id, a listing id, a target type, a user id and an `includeReplies` flag, so
 * the set that exists for "reviews anyone has asked for" cannot be enumerated
 * from a write that only knows one review's id. One `INCR` retires the lot;
 * see `cache.util.ts` for why that is the safer shape and not merely cheaper.
 *
 * **Local, not in `cache-namespaces.ts`.** That file is for namespaces more
 * than one module writes. Nothing outside this one writes a review: every
 * `prisma.review` write lives in `review.repository.ts`, and this service is
 * the repository's only caller, so the four write methods below are the
 * complete set of invalidation points.
 */
const reviewCache = versionedCache("review");

/**
 * Two minutes.
 *
 * Longer than the booking TTL because nothing here is money and nobody is
 * watching a review the way a guest watches a payment - and it can afford to be
 * because the writes below retire the namespace outright, so the TTL is only
 * ever the bound on an orphan, never the mechanism.
 */
const REVIEW_TTL = 120;

export default class ReviewSvc {
  static async createReview(data: {
    userId: string;
    bookingId?: string;
    entityId: string;
    entityType: string;
    rating: number;
    comment?: string;
  }) {
    let bookingId = data.bookingId;

    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: String(bookingId) },
        include: {
          event: {
            include: { venueTransactions: { take: 1 } },
          },
        },
      });
      if (!booking) throw new Error("Booking not found");
      if (booking.userId !== String(data.userId))
        throw new Error("This booking does not belong to you");
      if (booking.status === "cancelled" || booking.status === "pending") {
        throw new Error("Cannot review a booking that is pending or cancelled");
      }
      const existing = await prisma.review.findFirst({
        where: { bookingId: String(bookingId) },
      });
      if (existing) throw new Error("A review for this booking already exists");

      if (!data.entityId) {
        const venueTx = booking.event?.venueTransactions?.[0];
        if (venueTx?.venueId) {
          data.entityId = venueTx.venueId;
          data.entityType = "venue";
        }
      }
    } else {
      const event = await prisma.event.findFirst({
        orderBy: { createdAt: "desc" },
        include: { venueTransactions: { take: 1 } },
      });
      if (!event) throw new Error("No event available to link this review to");
      const booking = await BookingRepo.createWithIds({
        eventId: event.id,
        userId: String(data.userId),
        guestCount: 1,
        totalAmount: 0,
        status: "confirmed",
        startAt: new Date(),
        endAt: new Date(Date.now() + 86400000),
      });
      bookingId = booking.id;
      if (!data.entityId) {
        const venueTx = event.venueTransactions?.[0];
        if (venueTx?.venueId) {
          data.entityId = venueTx.venueId;
          data.entityType = "venue";
        }
      }
    }

    if (!data.entityId) {
      throw new Error(
        "Could not determine target entity from booking. Ensure the booking has an associated venue.",
      );
    }

    const review = await ReviewRepo.createReview({ ...data, bookingId });
    // Before the XP and notification side effects below, which are
    // fire-and-forget: a caller that reads straight back must not be told the
    // review it just wrote does not exist.
    await reviewCache.invalidateAll();

    if (data.bookingId) {
      // The repository retires the cache; `hasReview` is what hides the
      // "leave a review" button.
      await BookingRepo.setHasReview(String(data.bookingId), true);
    }

    // Award leaveReview XP + First Review badge (fire-and-forget)
    import("../passport/passport.service")
      .then(async ({ default: PassportSvc, XP_REWARDS, UserPath }) => {
        await PassportSvc.awardXP(
          String(data.userId),
          UserPath.user,
          XP_REWARDS.leaveReview,
        );
        const reviewCount = await prisma.review.count({
          where: { userId: String(data.userId) },
        });
        if (reviewCount === 1) {
          await PassportSvc.awardBadgeByName(
            String(data.userId),
            "First Review",
          );
        }

        // Award receive5StarReview XP to the provider when rating is 5
        if (data.rating >= 5) {
          let providerId: string | null = null;
          let providerPath: (typeof UserPath)[keyof typeof UserPath] =
            UserPath.user;

          if (data.entityType === "venue") {
            const venue = await prisma.venue.findUnique({
              where: { id: data.entityId },
              select: { mayorId: true },
            });
            providerId = venue?.mayorId ?? null;
            providerPath = UserPath.venueFoxer;
          } else if (data.entityType === "asset") {
            const asset = await prisma.asset.findUnique({
              where: { id: data.entityId },
              select: { ownerId: true },
            });
            providerId = asset?.ownerId ?? null;
            providerPath = UserPath.gearFoxer;
          } else if (data.entityType === "service") {
            const service = await prisma.service.findUnique({
              where: { id: data.entityId },
              select: { ownerId: true },
            });
            providerId = service?.ownerId ?? null;
            providerPath = UserPath.serviceFoxer;
          } else if (data.entityType === "event") {
            const event = await prisma.event.findUnique({
              where: { id: data.entityId },
              select: { organizerId: true },
            });
            providerId = event?.organizerId ?? null;
            providerPath = UserPath.eventFoxer;
          }

          if (providerId && providerId !== String(data.userId)) {
            await PassportSvc.awardXP(
              providerId,
              providerPath,
              XP_REWARDS.receive5StarReview,
            );
          }
        }
      })
      .catch(() => {});

    return review;
  }

  static async getAllReviews(includeReplies = false) {
    return reviewCache.cached(`all:${includeReplies}`, REVIEW_TTL, () =>
      ReviewRepo.getAllReviews(includeReplies),
    );
  }

  static async getReviewById(id: string, includeReplies = false) {
    return reviewCache.cached(`byId:${id}:${includeReplies}`, REVIEW_TTL, () =>
      ReviewRepo.getReviewById(id, includeReplies),
    );
  }

  static async getVenueReviews(venueId: string, includeReplies = false) {
    return reviewCache.cached(
      `venue:${venueId}:${includeReplies}`,
      REVIEW_TTL,
      () => ReviewRepo.getVenueReviews(venueId, includeReplies),
    );
  }

  static async getEventReviews(eventId: string, includeReplies = false) {
    return reviewCache.cached(
      `event:${eventId}:${includeReplies}`,
      REVIEW_TTL,
      () => ReviewRepo.getEventReviews(eventId, includeReplies),
    );
  }

  static async getReviewsByTarget(
    targetId: string,
    targetType: string,
    includeReplies = false,
  ) {
    return reviewCache.cached(
      `target:${targetType}:${targetId}:${includeReplies}`,
      REVIEW_TTL,
      () => ReviewRepo.findByTarget(targetId, targetType, includeReplies),
    );
  }

  static async getListingReviews(listingId: string, includeReplies = false) {
    // The distribution is an aggregate over every review on the listing, which
    // makes this the most expensive read in the module and the one most worth
    // caching.
    return reviewCache.cached(
      `listing:${listingId}:${includeReplies}`,
      REVIEW_TTL,
      () =>
        ReviewRepo.getListingReviewsWithDistribution(listingId, includeReplies),
    );
  }

  static async getRecentActivity(limit: number, includeReplies = false) {
    return reviewCache.cached(
      `recent:${limit}:${includeReplies}`,
      REVIEW_TTL,
      () => ReviewRepo.getRecentActivity(limit, includeReplies),
    );
  }

  static async getUserReviews(userId: string, includeReplies = false) {
    return reviewCache.cached(
      `user:${userId}:${includeReplies}`,
      REVIEW_TTL,
      () => ReviewRepo.getUserReviews(userId, includeReplies),
    );
  }

  static async replyToReview(reviewId: string, userId: string, text: string) {
    const review = await prisma.review.findUnique({
      where: { id: String(reviewId) },
    });
    if (!review) throw new Error("Review not found");

    const isReviewAuthor = review.userId === String(userId);
    let isVenueHost = false;

    if (review.entityType === "venue") {
      const venue = await prisma.venue.findUnique({
        where: { id: String(review.entityId) },
        select: { mayorId: true },
      });
      isVenueHost = venue?.mayorId === String(userId);
    } else if (review.entityType === "event") {
      const event = await prisma.event.findUnique({
        where: { id: String(review.entityId) },
        select: { organizerId: true },
      });
      isVenueHost = event?.organizerId === String(userId);
    }

    if (!isReviewAuthor && !isVenueHost) {
      throw new Error("Only the review author or the venue host can reply");
    }

    const reply = await ReviewRepo.createReply(reviewId, userId, text);
    // A reply changes every `includeReplies` read of its parent, and the parent
    // appears in the venue, event, listing, target and recent lists.
    await reviewCache.invalidateAll();
    return reply;
  }

  /**
   * A review may only be edited by the person who wrote it, or by an admin.
   *
   * This check was missing entirely: the route required a token but never asked
   * *whose*, so any authenticated user could rewrite or delete any review by id.
   * That is worse than it sounds, because `rating` feeds the Earned
   * Specialization threshold in `specialization.service.ts` — and Earned
   * specializations are never revoked. Deleting the bad reviews and inflating
   * the rest was enough to mint a permanent badge.
   *
   * `createReview` and `replyToReview` both already verified the caller. Only
   * update and delete were skipped.
   */
  private static async assertCanMutate(
    reviewId: string,
    requesterId: string,
    requesterRole?: string,
  ) {
    const review = await prisma.review.findUnique({
      where: { id: String(reviewId) },
      select: { id: true, userId: true },
    });
    if (!review) throw new Error("Review not found");

    const isAuthor = review.userId === String(requesterId);
    const isAdmin = requesterRole === "admin";
    if (!isAuthor && !isAdmin) throw new Error("Unauthorized");

    return review;
  }

  static async updateReview(params: {
    id: string;
    requesterId: string;
    requesterRole?: string;
    data: Partial<{ rating: number; comment: string }>;
  }) {
    const { id, requesterId, requesterRole, data } = params;
    await this.assertCanMutate(id, requesterId, requesterRole);

    // Only these two fields are writable. The controller validates as well, but
    // the repository spreads whatever it is handed straight into
    // `prisma.review.update`, so narrowing here too means a future caller
    // cannot reintroduce mass assignment by skipping the schema.
    const patch: Partial<{ rating: number; comment: string }> = {};
    if (data.rating !== undefined) patch.rating = data.rating;
    if (data.comment !== undefined) patch.comment = data.comment;

    const updated = await ReviewRepo.updateReview(id, patch);
    // `rating` feeds the listing distribution and the Earned Specialization
    // threshold, so a stale copy of it is not only cosmetic.
    await reviewCache.invalidateAll();
    return updated;
  }

  static async deleteReview(params: {
    id: string;
    requesterId: string;
    requesterRole?: string;
  }) {
    const { id, requesterId, requesterRole } = params;
    await this.assertCanMutate(id, requesterId, requesterRole);
    const deleted = await ReviewRepo.deleteReview(id);
    await reviewCache.invalidateAll();
    return deleted;
  }
}
