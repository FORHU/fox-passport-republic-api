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
  // `entityId`/`entityType` are a polymorphic reference (a favorite can point
  // at a Venue or an EventTemplate), not a Prisma relation — `include` can't
  // join across that, so the previous `include: {}` here never returned
  // anything for `venue`/`event`. The target listings are batch-fetched by
  // id below and merged back in, and the Prisma field names are mapped to
  // `targetId`/`type` to match what every frontend consumer of this
  // endpoint already reads (`f.targetId`, `f.type`).
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

    const [venues, templates] = await Promise.all([
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
    ]);

    const venueById = new Map(venues.map((v) => [v.id, v]));
    const templateById = new Map(templates.map((t) => [t.id, t]));

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
