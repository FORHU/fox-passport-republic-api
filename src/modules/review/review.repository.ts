import { prisma } from "../../utils/prisma";

const USER_SELECT = {
  select: { id: true, name: true, imgId: true },
} as const;

const REPLY_INCLUDE = {
  user: USER_SELECT,
} as const;

function mapReplies<T extends { reviewReplies?: unknown }>(
  obj: T,
): Omit<T, "reviewReplies"> & { replies: T["reviewReplies"] } {
  const { reviewReplies, ...rest } = obj;
  return { ...rest, replies: reviewReplies } as Omit<T, "reviewReplies"> & {
    replies: T["reviewReplies"];
  };
}

function mapRepliesList<T extends { reviewReplies?: unknown }>(
  list: T[],
): (Omit<T, "reviewReplies"> & { replies: T["reviewReplies"] })[] {
  return list.map(mapReplies);
}

/**
 * A ceiling on the review lists, not pagination.
 *
 * Five of the reads below took no limit: every review on a venue, on an event,
 * by a user, or in the system, of all time, in one response. A popular venue is
 * exactly where that breaks, and it breaks for everyone loading that venue.
 *
 * The lists are newest-first and the screens render them whole, so a cap keeps
 * the newest. Passing a smaller `take` is how a caller asks for less; more than
 * this needs pagination, which is a UI change rather than a query one.
 */
const REVIEW_LIMIT = 200;

export default class ReviewRepo {
  // READ ALL
  static async getAllReviews(includeReplies = false, take = REVIEW_LIMIT) {
    const reviews = await prisma.review.findMany({
      include: {
        user: USER_SELECT,
        ...(includeReplies
          ? {
              reviewReplies: {
                include: REPLY_INCLUDE,
                orderBy: { createdAt: "asc" },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return includeReplies ? mapRepliesList(reviews) : reviews;
  }

  // RECENT ACTIVITY — latest public reviews across all entities (landing page feed)
  static async getRecentActivity(limit = 10, includeReplies = false) {
    const reviews = await prisma.review.findMany({
      include: {
        user: USER_SELECT,
        ...(includeReplies
          ? {
              reviewReplies: {
                include: REPLY_INCLUDE,
                orderBy: { createdAt: "asc" },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return includeReplies ? mapRepliesList(reviews) : reviews;
  }

  /**
   * A listing's reviews, and the star distribution across *all* of them.
   *
   * The distribution is counted by the database rather than tallied from the
   * rows returned. Capping the list would otherwise have quietly changed what
   * the percentages mean - "of the newest 200" rather than "of all of them" -
   * and a rating that shifts when a venue passes its two hundredth review is a
   * worse bug than the unbounded query this cap is here to prevent.
   */
  static async getListingReviewsWithDistribution(
    entityId: string,
    includeReplies = false,
    take = REVIEW_LIMIT,
  ) {
    const [reviews, byRating] = await Promise.all([
      prisma.review.findMany({
        where: { entityId: String(entityId) },
        include: {
          user: USER_SELECT,
          ...(includeReplies
            ? {
                reviewReplies: {
                  include: REPLY_INCLUDE,
                  orderBy: { createdAt: "asc" },
                },
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { entityId: String(entityId) },
        _count: { _all: true },
      }),
    ]);

    // Compute rating distribution as percentages
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let total = 0;
    for (const row of byRating) {
      const star = Math.min(5, Math.max(1, Math.round(row.rating)));
      counts[star] = (counts[star] || 0) + row._count._all;
      total += row._count._all;
    }
    const ratingDistribution: Record<number, string> = {};
    for (const star of [5, 4, 3, 2, 1]) {
      ratingDistribution[star] =
        total > 0 ? `${Math.round((counts[star] / total) * 100)}%` : "0%";
    }

    return {
      reviews: includeReplies ? mapRepliesList(reviews) : reviews,
      ratingDistribution,
    };
  }

  // READ ONE
  static async getReviewById(id: string, includeReplies = false) {
    const review = await prisma.review.findUnique({
      where: { id: String(id) },
      include: {
        user: USER_SELECT,
        ...(includeReplies
          ? {
              reviewReplies: {
                include: REPLY_INCLUDE,
                orderBy: { createdAt: "asc" },
              },
            }
          : {}),
      },
    });
    return review && includeReplies ? mapReplies(review) : review;
  }

  // CREATE
  static async createReview(data: {
    userId: string;
    bookingId: string;
    entityId: string;
    entityType: string;
    rating: number;
    comment?: string;
  }) {
    return prisma.review.create({
      data: {
        userId: String(data.userId),
        bookingId: String(data.bookingId),
        entityId: String(data.entityId),
        entityType: String(data.entityType),
        rating: data.rating,
        comment: data.comment,
      },
      include: { user: USER_SELECT },
    });
  }

  // LIST BY TARGET
  static async findByTarget(
    targetId: string,
    targetType: string,
    includeReplies = false,
    take = REVIEW_LIMIT,
  ) {
    const reviews = await prisma.review.findMany({
      where: { entityId: String(targetId), entityType: String(targetType) },
      include: {
        user: USER_SELECT,
        ...(includeReplies
          ? {
              reviewReplies: {
                include: REPLY_INCLUDE,
                orderBy: { createdAt: "asc" },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return includeReplies ? mapRepliesList(reviews) : reviews;
  }

  // LIST BY VENUE
  static async getVenueReviews(
    venueId: string,
    includeReplies = false,
    take = REVIEW_LIMIT,
  ) {
    const reviews = await prisma.review.findMany({
      where: { entityType: "venue", entityId: String(venueId) },
      include: {
        user: USER_SELECT,
        ...(includeReplies
          ? {
              reviewReplies: {
                include: REPLY_INCLUDE,
                orderBy: { createdAt: "asc" },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return includeReplies ? mapRepliesList(reviews) : reviews;
  }

  // LIST BY EVENT
  static async getEventReviews(
    eventId: string,
    includeReplies = false,
    take = REVIEW_LIMIT,
  ) {
    const reviews = await prisma.review.findMany({
      where: { entityType: "event", entityId: String(eventId) },
      include: {
        user: USER_SELECT,
        ...(includeReplies
          ? {
              reviewReplies: {
                include: REPLY_INCLUDE,
                orderBy: { createdAt: "asc" },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return includeReplies ? mapRepliesList(reviews) : reviews;
  }

  // LIST BY USER
  static async getUserReviews(
    userId: string,
    includeReplies = false,
    take = REVIEW_LIMIT,
  ) {
    const reviews = await prisma.review.findMany({
      where: { userId: String(userId) },
      include: {
        user: USER_SELECT,
        ...(includeReplies
          ? {
              reviewReplies: {
                include: REPLY_INCLUDE,
                orderBy: { createdAt: "asc" },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return includeReplies ? mapRepliesList(reviews) : reviews;
  }

  // CREATE REPLY
  static async createReply(reviewId: string, userId: string, text: string) {
    return prisma.reviewReply.create({
      data: {
        reviewId: String(reviewId),
        userId: String(userId),
        text,
      },
    });
  }

  // UPDATE
  static async updateReview(
    id: string,
    data: Partial<{ rating: number; comment: string }>,
  ) {
    return prisma.review.update({
      where: { id: String(id) },
      data,
    });
  }

  // DELETE
  static async deleteReview(id: string) {
    return prisma.review.delete({
      where: { id: String(id) },
    });
  }
}
