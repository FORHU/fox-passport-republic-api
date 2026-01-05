import { prisma } from "../utils/prisma";

export default class FavoriteRepo {
  // READ ALL user favorites
  static async getUserFavorites(userId: string) {
    return prisma.favorite.findMany({
      where: { userId },
      include: {
        event: {
          include: {
            foxer: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
            category: true,
            images: {
              where: {
                isPrimary: true,
              },
              take: 1,
            },
            details: true,
          },
        },
      },
      orderBy: {
        savedAt: "desc",
      },
    });
  }

  // CREATE (Add to favorites)
  static async addFavorite(data: { userId: string; eventId: string }) {
    return prisma.favorite.create({
      data: {
        userId: data.userId,
        eventId: data.eventId,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            description: true,
          },
        },
      },
    });
  }

  // DELETE (Remove from favorites)
  static async removeFavorite(id: string) {
    return prisma.favorite.delete({
      where: { id },
    });
  }

  // DELETE by userId and eventId
  static async removeFavoriteByUserAndEvent(userId: string, eventId: string) {
    return prisma.favorite.deleteMany({
      where: {
        userId,
        eventId,
      },
    });
  }

  // Check if favorite exists
  static async favoriteExists(id: string) {
    const favorite = await prisma.favorite.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!favorite;
  }

  // Check if user favorited event
  static async isFavorited(userId: string, eventId: string) {
    const favorite = await prisma.favorite.findFirst({
      where: {
        userId,
        eventId,
      },
      select: { id: true },
    });
    return !!favorite;
  }

  // Get favorite by userId and eventId
  static async getFavoriteByUserAndEvent(userId: string, eventId: string) {
    return prisma.favorite.findFirst({
      where: {
        userId,
        eventId,
      },
    });
  }

  // Check if user owns favorite
  static async isFavoriteOwner(favoriteId: string, userId: string) {
    const favorite = await prisma.favorite.findFirst({
      where: {
        id: favoriteId,
        userId: userId,
      },
      select: { id: true },
    });
    return !!favorite;
  }
}
