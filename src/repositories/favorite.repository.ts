import { prisma } from "../utils/prisma";

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
  static async getUserFavorites(userId: string) {
    return prisma.favorite.findMany({
      where: { userId: String(userId) },
      include: {},
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
