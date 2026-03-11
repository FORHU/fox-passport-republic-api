import { prisma } from "../utils/prisma";

export default class FavoriteRepo {
  // TOGGLE
  static async toggleFavorite(userId: number | string, targetId: number | string, type: 'venue' | 'event') {
    const where: any = { userId: Number(userId) };
    if (type === 'venue') where.venueId = Number(targetId);
    else where.eventId = Number(targetId);

    const existing = await prisma.favorite.findFirst({ where });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return { added: false };
    } else {
      await prisma.favorite.create({
        data: {
          userId: Number(userId),
          venueId: type === 'venue' ? Number(targetId) : undefined,
          eventId: type === 'event' ? Number(targetId) : undefined
        }
      });
      return { added: true };
    }
  }

  // LIST USER FAVORITES
  static async getUserFavorites(userId: number | string) {
    return prisma.favorite.findMany({
      where: { userId: Number(userId) },
      include: {
        // Determine what to include?
        // Ideally we include the related entity.
        // But Prisma might complain if we include both and they are null.
        // Let's rely on basic query for now.
      }
    });
  }

  // CHECK
  static async isFavorite(userId: number | string, targetId: number | string, type: 'venue' | 'event') {
    const where: any = { userId: Number(userId) };
    if (type === 'venue') where.venueId = Number(targetId);
    else where.eventId = Number(targetId);

    const favorite = await prisma.favorite.findFirst({ where });
    return !!favorite;
  }

  // REMOVE BY ID
  static async removeFavorite(id: number | string) {
    return prisma.favorite.delete({
      where: { id: Number(id) }
    });
  }

  // REMOVE BY LISTING
  static async removeFavoriteByListing(userId: number | string, targetId: number | string, type: 'venue' | 'event') {
    const where: any = { userId: Number(userId) };
    if (type === 'venue') where.venueId = Number(targetId);
    else where.eventId = Number(targetId);

    return prisma.favorite.deleteMany({ where });
  }
}
