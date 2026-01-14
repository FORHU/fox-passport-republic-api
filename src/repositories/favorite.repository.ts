import { prisma } from "../utils/prisma";

export default class FavoriteRepo {
  // TOGGLE
  static async toggleFavorite(userId: string, targetId: string, type: 'venue' | 'event') {
    const where: any = { userId };
    if (type === 'venue') where.venueId = targetId;
    else where.eventId = targetId;

    const existing = await prisma.favorite.findFirst({ where });

    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return { added: false };
    } else {
      await prisma.favorite.create({
        data: {
          userId,
          venueId: type === 'venue' ? targetId : undefined,
          eventId: type === 'event' ? targetId : undefined
        }
      });
      return { added: true };
    }
  }

  // LIST USER FAVORITES
  static async getUserFavorites(userId: string) {
    return prisma.favorite.findMany({
      where: { userId },
      include: {
        // Determine what to include?
        // Ideally we include the related entity.
        // But Prisma might complain if we include both and they are null.
        // Let's rely on basic query for now.
      }
    });
  }
}
