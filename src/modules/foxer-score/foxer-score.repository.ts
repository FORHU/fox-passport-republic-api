import { prisma } from "../../utils/prisma";
import { UserPath } from "@prisma/client";

export default class FoxerScoreRepo {
  /**
   * Aggregates review volume and average rating across all entities owned by the Foxer.
   */
  static async getFoxerReviewStats(userId: string) {
    const [venues, assets, services, events] = await Promise.all([
      prisma.venue.findMany({
        where: { mayorId: userId },
        select: { id: true },
      }),
      prisma.asset.findMany({
        where: { ownerId: userId },
        select: { id: true },
      }),
      prisma.service.findMany({
        where: { ownerId: userId },
        select: { id: true },
      }),
      prisma.event.findMany({
        where: { organizerId: userId },
        select: { id: true },
      }),
    ]);

    const entityIds = [
      ...venues.map((v) => v.id),
      ...assets.map((a) => a.id),
      ...services.map((s) => s.id),
      ...events.map((e) => e.id),
    ];

    if (entityIds.length === 0) {
      return { reviewCount: 0, avgRating: 0 };
    }

    const aggregations = await prisma.review.aggregate({
      where: { entityId: { in: entityIds } },
      _count: { id: true },
      _avg: { rating: true },
    });

    return {
      reviewCount: aggregations._count.id,
      avgRating: aggregations._avg.rating ?? 0,
    };
  }

  /** The city and roles a Foxer is placed by on the leaderboards. */
  static async getUserPlace(
    userId: string,
  ): Promise<{ city: string | null; roleType: string[] } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { city: true, roleType: true },
    });
    return user ? { city: user.city, roleType: user.roleType } : null;
  }

  /**
   * Computes the platform-wide average rating across all reviews.
   */
  static async getPlatformAvgRating(): Promise<number> {
    const agg = await prisma.review.aggregate({
      _avg: { rating: true },
    });
    return agg._avg.rating ?? 4.5;
  }

  /**
   * Counts total completed bookings associated with the Foxer's listings or events.
   */
  static async getCompletedBookingsCount(userId: string): Promise<number> {
    const [eventBookings, serviceBookings, assetBookings] = await Promise.all([
      prisma.booking.count({
        where: {
          status: "completed",
          OR: [
            { event: { organizerId: userId } },
            { venueTransactions: { some: { providerId: userId } } },
            { serviceTransactions: { some: { providerId: userId } } },
            { assetTransactions: { some: { providerId: userId } } },
          ],
        },
      }),
      prisma.serviceBooking.count({
        where: {
          status: "completed",
          service: { ownerId: userId },
        },
      }),
      prisma.assetBooking.count({
        where: {
          status: "completed",
          asset: { ownerId: userId },
        },
      }),
    ]);

    return eventBookings + serviceBookings + assetBookings;
  }

  /**
   * Retrieves responsiveness statistics: total booking requests and those responded to within 24h.
   */
  static async getResponsivenessStats(userId: string): Promise<{
    totalRequests: number;
    answeredWithin24h: number;
  }> {
    const [eventBookings, serviceBookings, assetBookings] = await Promise.all([
      prisma.booking.findMany({
        where: {
          OR: [
            { event: { organizerId: userId } },
            { venueTransactions: { some: { providerId: userId } } },
            { serviceTransactions: { some: { providerId: userId } } },
            { assetTransactions: { some: { providerId: userId } } },
          ],
        },
        select: { status: true, createdAt: true, updatedAt: true },
      }),
      prisma.serviceBooking.findMany({
        where: { service: { ownerId: userId } },
        select: { status: true, createdAt: true, updatedAt: true },
      }),
      prisma.assetBooking.findMany({
        where: { asset: { ownerId: userId } },
        select: { status: true, createdAt: true, updatedAt: true },
      }),
    ]);

    const allRequests = [
      ...eventBookings,
      ...serviceBookings,
      ...assetBookings,
    ];

    if (allRequests.length === 0) {
      return { totalRequests: 0, answeredWithin24h: 0 };
    }

    let answeredWithin24h = 0;
    const dayMs = 24 * 60 * 60 * 1000;
    for (const req of allRequests) {
      if (req.status !== "pending") {
        const diff = req.updatedAt.getTime() - req.createdAt.getTime();
        if (diff <= dayMs) {
          answeredWithin24h++;
        }
      }
    }

    return {
      totalRequests: allRequests.length,
      answeredWithin24h,
    };
  }

  /**
   * Calculates reliability based on cancellation rate over the Foxer's last 20 bookings.
   */
  static async getRecentBookingsReliability(userId: string): Promise<{
    totalRecent: number;
    cancelledCount: number;
  }> {
    const [eventBookings, serviceBookings, assetBookings] = await Promise.all([
      prisma.booking.findMany({
        where: {
          OR: [
            { event: { organizerId: userId } },
            { venueTransactions: { some: { providerId: userId } } },
            { serviceTransactions: { some: { providerId: userId } } },
            { assetTransactions: { some: { providerId: userId } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { status: true, createdAt: true },
      }),
      prisma.serviceBooking.findMany({
        where: { service: { ownerId: userId } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { status: true, createdAt: true },
      }),
      prisma.assetBooking.findMany({
        where: { asset: { ownerId: userId } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { status: true, createdAt: true },
      }),
    ]);

    const allRecent = [...eventBookings, ...serviceBookings, ...assetBookings]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20);

    if (allRecent.length === 0) {
      return { totalRecent: 0, cancelledCount: 0 };
    }

    const cancelledCount = allRecent.filter(
      (b) => b.status === "cancelled",
    ).length;

    return {
      totalRecent: allRecent.length,
      cancelledCount,
    };
  }

  /**
   * Obtains verification status and highest level across Foxer role paths.
   */
  static async getTrustFactors(userId: string): Promise<{
    isVerified: boolean;
    foxerLevel: number;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        identityVerifiedAt: true,
        passport: {
          include: {
            paths: true,
          },
        },
      },
    });

    const isVerified = Boolean(user?.identityVerifiedAt);
    const foxerPaths =
      user?.passport?.paths.filter((p) => p.path !== UserPath.user) ?? [];
    const maxFoxerLevel = foxerPaths.reduce(
      (max, p) => Math.max(max, p.level),
      1,
    );

    return {
      isVerified,
      foxerLevel: maxFoxerLevel,
    };
  }
}
