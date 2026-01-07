import { prisma } from "../utils/prisma";

export default class FavoriteRepo {
  // READ ALL user favorites
  static async getUserFavorites(userId: string) {
    return prisma.favorite.findMany({
      where: { userId },
      include: {
        listing: {
          include: {
            host: {
              select: {
                id: true,
                name: true,
                username: true,
              },
            },
            category: true,
            images: {
              where: {
                isThumbnail: true,
              },
              take: 1,
            },
            location: true,
          },
        },
      },
      orderBy: {
        savedAt: "desc",
      },
    });
  }

  // CREATE (Add to favorites)
  static async addFavorite(data: {
    userId: string;
    listingId: string;
  }) {
    return prisma.favorite.create({
      data: {
        userId: data.userId,
        listingId: data.listingId,
      },
      include: {
        listing: {
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

  // DELETE by userId and listingId
  static async removeFavoriteByUserAndListing(userId: string, listingId: string) {
    return prisma.favorite.deleteMany({
      where: {
        userId,
        listingId,
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

  // Check if user favorited listing
  static async isFavorited(userId: string, listingId: string) {
    const favorite = await prisma.favorite.findFirst({
      where: {
        userId,
        listingId,
      },
      select: { id: true },
    });
    return !!favorite;
  }

  // Get favorite by userId and listingId
  static async getFavoriteByUserAndListing(userId: string, listingId: string) {
    return prisma.favorite.findFirst({
      where: {
        userId,
        listingId,
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
