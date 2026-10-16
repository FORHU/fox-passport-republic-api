import { prisma } from "../../utils/prisma";

export default class FavoriteRepo {
  // TOGGLE
  static async toggleFavorite(userId: string, targetId: string, type: string) {
    const where = {
      userId: String(userId),
      entityId: String(targetId),
      entityType: String(type),
    };

    const existing = await prisma.favorite.findFirst({ where });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return { added: false };
    } else {
      await prisma.favorite.create({
        data: {
          userId: String(userId),
          entityId: String(targetId),
          entityType: String(type),
        },
      });
      return { added: true };
    }
  }

  // LIST USER FAVORITES
  //
  // `entityId`/`entityType` are polymorphic references, not Prisma relations.
  // Targets are batch-fetched below and the Prisma field names are mapped to
  // `targetId`/`type` to match what frontend consumers already read.
  static async getUserFavorites(userId: string) {
    const favorites = await prisma.favorite.findMany({
      where: { userId: String(userId) },
      orderBy: { createdAt: "desc" },
    });

    if (favorites.length === 0) return [];

    const venueIds = favorites
      .filter((f) => f.entityType === "venue")
      .map((f) => f.entityId);
    const eventIds = favorites
      .filter((f) => f.entityType === "event")
      .map((f) => f.entityId);
    const publicEventIds = favorites
      .filter((f) => f.entityType === "public_event")
      .map((f) => f.entityId);

    const [venues, templates, publicEvents] = await Promise.all([
      venueIds.length
        ? prisma.venue.findMany({
            where: { id: { in: venueIds } },
            include: { images: { take: 1 } },
          })
        : Promise.resolve([]),
      eventIds.length
        ? prisma.eventTemplate.findMany({
            where: { id: { in: eventIds } },
            include: {
              images: { take: 1 },
              templateVenues: { include: { venue: true } },
            },
          })
        : Promise.resolve([]),
      publicEventIds.length
        ? prisma.event.findMany({
            where: {
              id: { in: publicEventIds },
              isPublic: true,
              requestStatus: "approved",
              eventStatus: { notIn: ["cancelled", "completed"] },
              startAt: { gte: new Date() },
            },
            select: {
              id: true,
              name: true,
              eventCategory: true,
              startAt: true,
              endAt: true,
              guestCount: true,
              totalAmount: true,
              targetCity: true,
              template: {
                select: {
                  images: { take: 1, select: { url: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const venueById = new Map(venues.map((v) => [v.id, v]));
    const templateById = new Map(templates.map((t) => [t.id, t]));
    const publicEventById = new Map(
      publicEvents.map((event) => [event.id, event]),
    );

    return favorites.map((f) => {
      const base = {
        id: f.id,
        targetId: f.entityId,
        type: f.entityType,
        createdAt: f.createdAt,
      };

      if (f.entityType === "venue") {
        const venue = venueById.get(f.entityId);
        return {
          ...base,
          venue: venue
            ? {
                id: venue.id,
                name: venue.name,
                city: venue.city,
                state: venue.state,
                price: venue.price,
                billingRate: venue.billingRate,
                images: venue.images,
              }
            : undefined,
        };
      }

      if (f.entityType === "event") {
        const template = templateById.get(f.entityId);
        return {
          ...base,
          event: template
            ? {
                id: template.id,
                name: template.name,
                city: template.targetCity,
                state: template.targetState,
                price: template.templateVenues[0]?.venue?.price ?? null,
                images: template.images,
              }
            : undefined,
        };
      }

      if (f.entityType === "public_event") {
        const event = publicEventById.get(f.entityId);
        return {
          ...base,
          event: event
            ? {
                id: event.id,
                name: event.name,
                category: event.eventCategory,
                city: event.targetCity,
                startAt: event.startAt,
                guestCount: event.guestCount,
                price: event.totalAmount,
                images: event.template?.images ?? [],
              }
            : undefined,
        };
      }

      return base;
    });
  }

  // CHECK
  static async isFavorite(userId: string, targetId: string, type: string) {
    const where = {
      userId: String(userId),
      entityId: String(targetId),
      entityType: String(type),
    };

    const favorite = await prisma.favorite.findFirst({ where });
    return !!favorite;
  }

  // REMOVE BY ID
  static async removeFavorite(id: string) {
    return prisma.favorite.delete({
      where: { id: String(id) },
    });
  }

  // REMOVE BY LISTING
  static async removeFavoriteByListing(
    userId: string,
    targetId: string,
    type: string,
  ) {
    const where = {
      userId: String(userId),
      entityId: String(targetId),
      entityType: String(type),
    };

    return prisma.favorite.deleteMany({ where });
  }
}
