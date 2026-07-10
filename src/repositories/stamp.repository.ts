import { prisma } from "../utils/prisma";

export default class StampRepo {
  static async findByBookingId(bookingId: string) {
    return prisma.stamp.findUnique({ where: { bookingId } });
  }

  static async getBookingWithEvent(bookingId: string) {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: {
          include: {
            template: {
              include: {
                images: true,
              },
            },
          },
        },
      },
    });
  }

  static async create(data: {
    userId: string;
    bookingId: string;
    templateId?: string | null;
    imageUrl: string;
    eventName: string;
  }) {
    return prisma.stamp.create({ data });
  }

  static async findByUser(userId: string) {
    return prisma.stamp.findMany({
      where: { userId },
      orderBy: { earnedAt: "desc" },
    });
  }
}
