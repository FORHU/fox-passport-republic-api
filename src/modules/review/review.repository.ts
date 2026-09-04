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

export default class ReviewRepo {
  // READ ALL
  static async getAllReviews(includeReplies = false) {
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

  // LISTING REVIEWS + rating distribution
  static async getListingReviewsWithDistribution(
    entityId: string,
    includeReplies = false,
  ) {
    const reviews = await prisma.review.findMany({
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
    });

    // Compute rating distribution as percentages
    const total = reviews.length;
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of reviews) {
      const star = Math.min(5, Math.max(1, Math.round(r.rating)));
      counts[star] = (counts[star] || 0) + 1;
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
    });
    return includeReplies ? mapRepliesList(reviews) : reviews;
  }

  // LIST BY VENUE
  static async getVenueReviews(venueId: string, includeReplies = false) {
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
    });
    return includeReplies ? mapRepliesList(reviews) : reviews;
  }

  // LIST BY EVENT
  static async getEventReviews(eventId: string, includeReplies = false) {
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
    });
    return includeReplies ? mapRepliesList(reviews) : reviews;
  }

  // LIST BY USER
  static async getUserReviews(userId: string, includeReplies = false) {
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
