import { RoleType } from "@prisma/client";
import { prisma } from "../utils/prisma";

const EARNED_THRESHOLD = 3;
const EARNED_MIN_RATING = 4.0;

export default class SpecializationSvc {
  // Called after an event booking completes — checks EventFoxer specialization
  static async checkEventFoxer(organizerId: string, eventCategory: string) {
    await SpecializationSvc.maybeGrant(
      organizerId,
      RoleType.eventFoxer,
      eventCategory,
      async () => {
        const events = await prisma.event.findMany({
          where: {
            organizerId,
            eventCategory: eventCategory as any,
            eventStatus: "completed",
          },
          select: { id: true },
        });
        if (events.length < EARNED_THRESHOLD) return false;

        const eventIds = events.map((e) => e.id);
        const bookingIds = await prisma.booking.findMany({
          where: { eventId: { in: eventIds }, status: "completed" },
          select: { id: true },
        });
        if (bookingIds.length === 0) return false;

        const bIds = bookingIds.map((b) => b.id);
        const templates = await prisma.eventTemplate.findMany({
          where: { ownerId: organizerId, category: eventCategory as any },
          select: { id: true },
        });
        const tIds = templates.map((t) => t.id);
        if (tIds.length === 0) return false;

        const reviewAgg = await prisma.review.aggregate({
          where: { entityId: { in: tIds }, entityType: "event_template" },
          _avg: { rating: true },
          _count: { id: true },
        });
        return (
          (reviewAgg._count.id ?? 0) >= EARNED_THRESHOLD &&
          (reviewAgg._avg.rating ?? 0) >= EARNED_MIN_RATING
        );
      },
    );
  }

  // Called after a service booking completes — checks ServiceFoxer specialization
  static async checkServiceFoxer(serviceId: string, ownerId: string) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { category: true },
    });
    if (!service) return;

    await SpecializationSvc.maybeGrant(
      ownerId,
      RoleType.serviceFoxer,
      service.category,
      async () => {
        const count = await prisma.serviceBooking.count({
          where: {
            service: { ownerId, category: service.category },
            status: "completed",
          },
        });
        if (count < EARNED_THRESHOLD) return false;

        const reviewAgg = await prisma.review.aggregate({
          where: { entityId: serviceId, entityType: "service" },
          _avg: { rating: true },
          _count: { id: true },
        });
        return (
          (reviewAgg._count.id ?? 0) >= EARNED_THRESHOLD &&
          (reviewAgg._avg.rating ?? 0) >= EARNED_MIN_RATING
        );
      },
    );
  }

  // Called after an asset booking completes — checks GearFoxer specialization
  static async checkGearFoxer(assetId: string, ownerId: string) {
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      select: { category: true },
    });
    if (!asset) return;

    await SpecializationSvc.maybeGrant(
      ownerId,
      RoleType.gearFoxer,
      asset.category,
      async () => {
        const count = await prisma.assetBooking.count({
          where: {
            asset: { ownerId, category: asset.category },
            status: "completed",
          },
        });
        if (count < EARNED_THRESHOLD) return false;

        const reviewAgg = await prisma.review.aggregate({
          where: { entityId: assetId, entityType: "asset" },
          _avg: { rating: true },
          _count: { id: true },
        });
        return (
          (reviewAgg._count.id ?? 0) >= EARNED_THRESHOLD &&
          (reviewAgg._avg.rating ?? 0) >= EARNED_MIN_RATING
        );
      },
    );
  }

  // Called after a venue is used in a completed event — checks VenueFoxer specialization
  static async checkVenueFoxer(venueId: string, ownerId: string) {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { category: true },
    });
    if (!venue) return;

    await SpecializationSvc.maybeGrant(
      ownerId,
      RoleType.venueFoxer,
      venue.category,
      async () => {
        const count = await prisma.eventVenueTransaction.count({
          where: { venueId, providerId: ownerId, status: "approved" },
        });
        if (count < EARNED_THRESHOLD) return false;

        const reviewAgg = await prisma.review.aggregate({
          where: { entityId: venueId, entityType: "venue" },
          _avg: { rating: true },
          _count: { id: true },
        });
        return (
          (reviewAgg._count.id ?? 0) >= EARNED_THRESHOLD &&
          (reviewAgg._avg.rating ?? 0) >= EARNED_MIN_RATING
        );
      },
    );
  }

  private static async maybeGrant(
    userId: string,
    roleType: RoleType,
    category: string,
    qualifies: () => Promise<boolean>,
  ) {
    // Skip if already earned
    const existing = await prisma.foxerSpecialization.findUnique({
      where: { userId_roleType_category: { userId, roleType, category } },
    });
    if (existing) return;

    const passes = await qualifies();
    if (!passes) return;

    await prisma.foxerSpecialization.create({
      data: { userId, roleType, category, source: "earned" },
    });
  }

  static async getForUser(userId: string) {
    return prisma.foxerSpecialization.findMany({
      where: { userId },
      orderBy: [{ roleType: "asc" }, { source: "asc" }],
    });
  }

  static async getForUsers(userIds: string[]) {
    if (userIds.length === 0) return [];
    return prisma.foxerSpecialization.findMany({
      where: { userId: { in: userIds } },
    });
  }
}
