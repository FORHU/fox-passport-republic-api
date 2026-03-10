import { prisma } from "../utils/prisma";

export default class FavoriteRepo {
  // TOGGLE
  static async toggleFavorite(userId: string, targetId: string, type: 'venue' | 'event') {
    const where: any = { userId: String(userId) };
    if (type === 'venue') where.venueId = String(targetId);
    else where.eventId = String(targetId);

    const existing = await prisma.favorite.findFirst({ where });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return { added: false };
    } else {
      await prisma.favorite.create({
        data: {
          userId: String(userId),
          venueId: type === 'venue' ? String(targetId) : undefined,
          eventId: type === 'event' ? String(targetId) : undefined
        }
      });
      return { added: true };
    }
  }

  // LIST USER FAVORITES
  static async getUserFavorites(userId: string) {
    return prisma.favorite.findMany({
      where: { userId: String(userId) },
      include: {}
    });
  }

  // CHECK
  static async isFavorite(userId: string, targetId: string, type: 'venue' | 'event') {
    const where: any = { userId: String(userId) };
    if (type === 'venue') where.venueId = String(targetId);
    else where.eventId = String(targetId);

    const favorite = await prisma.favorite.findFirst({ where });
    return !!favorite;
  }

  // REMOVE BY ID
  static async removeFavorite(id: string) {
    return prisma.favorite.delete({
      where: { id: String(id) }
    });
  }

  // REMOVE BY LISTING
  static async removeFavoriteByListing(userId: string, targetId: string, type: 'venue' | 'event') {
    const where: any = { userId: String(userId) };
    if (type === 'venue') where.venueId = String(targetId);
    else where.eventId = String(targetId);

    return prisma.favorite.deleteMany({ where });
  }
}
