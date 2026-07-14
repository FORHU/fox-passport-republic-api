import { prisma } from "../utils/prisma";
import ReviewRepo from "../repositories/review.repository";

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
      const booking = await prisma.booking.create({
        data: {
          eventId: event.id,
          userId: String(data.userId),
          guestCount: 1,
          totalAmount: 0,
          status: "confirmed",
          startAt: new Date(),
          endAt: new Date(Date.now() + 86400000),
        },
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

    console.log("Saving review with entityId:", data.entityId);
    const review = await ReviewRepo.createReview({ ...data, bookingId });

    if (data.bookingId) {
      await prisma.booking.update({
        where: { id: String(data.bookingId) },
        data: { hasReview: true } as any,
      });
    }

    // Award leaveReview XP + First Review badge (fire-and-forget)
    import("./passport.service").then(async ({ default: PassportSvc, XP_REWARDS, UserPath }) => {
      await PassportSvc.awardXP(String(data.userId), UserPath.user, XP_REWARDS.leaveReview);
      const reviewCount = await prisma.review.count({ where: { userId: String(data.userId) } });
      if (reviewCount === 1) {
        await PassportSvc.awardBadgeByName(String(data.userId), "First Review");
      }

      // Award receive5StarReview XP to the provider when rating is 5
      if (data.rating >= 5) {
        let providerId: string | null = null;
        let providerPath: typeof UserPath[keyof typeof UserPath] = UserPath.user;

        if (data.entityType === "venue") {
          const venue = await prisma.venue.findUnique({ where: { id: data.entityId }, select: { mayorId: true } });
          providerId = venue?.mayorId ?? null;
          providerPath = UserPath.venueFoxer;
        } else if (data.entityType === "asset") {
          const asset = await prisma.asset.findUnique({ where: { id: data.entityId }, select: { ownerId: true } });
          providerId = asset?.ownerId ?? null;
          providerPath = UserPath.gearFoxer;
        } else if (data.entityType === "service") {
          const service = await prisma.service.findUnique({ where: { id: data.entityId }, select: { ownerId: true } });
          providerId = service?.ownerId ?? null;
          providerPath = UserPath.serviceFoxer;
        } else if (data.entityType === "event") {
          const event = await prisma.event.findUnique({ where: { id: data.entityId }, select: { organizerId: true } });
          providerId = event?.organizerId ?? null;
          providerPath = UserPath.eventFoxer;
        }

        if (providerId && providerId !== String(data.userId)) {
          await PassportSvc.awardXP(providerId, providerPath, XP_REWARDS.receive5StarReview);
        }
      }
    }).catch(() => {});

    return review;
  }

  static async getAllReviews(includeReplies = false) {
    return ReviewRepo.getAllReviews(includeReplies);
  }

  static async getReviewById(id: string, includeReplies = false) {
    return ReviewRepo.getReviewById(id, includeReplies);
  }

  static async getVenueReviews(venueId: string, includeReplies = false) {
    return ReviewRepo.getVenueReviews(venueId, includeReplies);
  }

  static async getEventReviews(eventId: string, includeReplies = false) {
    return ReviewRepo.getEventReviews(eventId, includeReplies);
  }

  static async getReviewsByTarget(
    targetId: string,
    targetType: string,
    includeReplies = false,
  ) {
    return ReviewRepo.findByTarget(targetId, targetType, includeReplies);
  }

  static async getListingReviews(listingId: string, includeReplies = false) {
    console.log("Querying reviews for entityId:", listingId);
    return ReviewRepo.getListingReviewsWithDistribution(
      listingId,
      includeReplies,
    );
  }

  static async getRecentActivity(limit: number, includeReplies = false) {
    return ReviewRepo.getRecentActivity(limit, includeReplies);
  }

  static async getUserReviews(userId: string, includeReplies = false) {
    return ReviewRepo.getUserReviews(userId, includeReplies);
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

    return ReviewRepo.createReply(reviewId, userId, text);
  }

  static async updateReview(id: string, data: any) {
    return ReviewRepo.updateReview(id, data);
  }

  static async deleteReview(id: string) {
    return ReviewRepo.deleteReview(id);
  }
}
