import { prisma } from "../utils/prisma";
import PassportSvc from "../services/passport.service";

export default class StampRepo {
  static async findByBookingId(bookingId: string) {
    return prisma.passportStamp.findUnique({ where: { bookingId } });
  }

  static async getBookingForStamp(bookingId: string) {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true },
    });
  }

  static async findByUser(userId: string) {
    const passport = await PassportSvc.getOrCreate(userId);
    return prisma.passportStamp.findMany({
      where: { passportId: passport.id },
      orderBy: { createdAt: "desc" },
    });
  }
}
