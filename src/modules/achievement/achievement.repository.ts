import { prisma } from "../../utils/prisma";
import FoxerScoreRepo from "../foxer-score/foxer-score.repository";

export interface CitizenCounters {
  attendedEvents: number;
  distinctVenues: number;
  distinctCities: number;
  reviews: number;
  posts: number;
  comments: number;
  likesReceived: number;
}

export interface FoxerCounters {
  listings: number;
  completedBookings: number;
  fiveStarReviews: number;
  quickReplies: number;
  reliableBookings: number;
}

export class AchievementRepo {
  static async getCitizenCounters(userId: string): Promise<CitizenCounters> {
    const [
      attendedEvents,
      venueStamps,
      cityStamps,
      reviews,
      posts,
      comments,
      likesReceived,
    ] = await Promise.all([
      // Attended events (passport stamps)
      prisma.passportStamp.count({
        where: { passport: { userId } },
      }),
      // Distinct venues visited
      prisma.passportStamp.findMany({
        where: { passport: { userId }, venueId: { not: null } },
        select: { venueId: true },
        distinct: ["venueId"],
      }),
      // Distinct cities visited
      prisma.passportStamp.findMany({
        where: {
          passport: { userId },
          venueId: { not: null },
        },
        include: {
          venue: { select: { city: true } },
        },
      }),
      // Total reviews authored
      prisma.review.count({
        where: { userId },
      }),
      // Community feed posts
      prisma.post.count({
        where: { authorId: userId },
      }),
      // Post comments
      prisma.postComment.count({
        where: { authorId: userId },
      }),
      // Likes received on user's posts
      prisma.postLike.count({
        where: { post: { authorId: userId } },
      }),
    ]);

    const distinctCities = new Set(
      cityStamps.map((s) => s.venue?.city).filter(Boolean),
    ).size;

    return {
      attendedEvents,
      distinctVenues: venueStamps.length,
      distinctCities,
      reviews,
      posts,
      comments,
      likesReceived,
    };
  }

  static async getFoxerCounters(userId: string): Promise<FoxerCounters> {
    const [
      venues,
      assets,
      services,
      completedBookings,
      responsiveness,
      reliability,
    ] = await Promise.all([
      prisma.venue.findMany({
        where: { mayorId: userId },
        select: { id: true },
      }),
      prisma.asset.findMany({
        where: { ownerId: userId, deletedAt: null },
        select: { id: true },
      }),
      prisma.service.findMany({
        where: { ownerId: userId, deletedAt: null },
        select: { id: true },
      }),
      FoxerScoreRepo.getCompletedBookingsCount(userId),
      FoxerScoreRepo.getResponsivenessStats(userId),
      FoxerScoreRepo.getRecentBookingsReliability(userId),
    ]);

    const entityIds = [
      ...venues.map((v: { id: string }) => v.id),
      ...assets.map((a: { id: string }) => a.id),
      ...services.map((s: { id: string }) => s.id),
    ];

    const fiveStarReviews =
      entityIds.length > 0
        ? await prisma.review.count({
            where: {
              entityId: { in: entityIds },
              rating: 5,
            },
          })
        : 0;

    const listings = entityIds.length;
    const quickReplies = responsiveness.answeredWithin24h;
    const reliableBookings = Math.max(
      0,
      completedBookings - reliability.cancelledCount,
    );

    return {
      listings,
      completedBookings,
      fiveStarReviews,
      quickReplies,
      reliableBookings,
    };
  }
}

export default AchievementRepo;
