import StampRepo from "../repositories/stamp.repository";
import PassportSvc from "./passport.service";

export default class StampSvc {
  static async createStamp(userId: string, bookingId: string) {
    const booking = await StampRepo.getBookingForStamp(bookingId);
    if (!booking) {
      throw new Error("BOOKING_NOT_FOUND");
    }

    if (booking.userId !== userId) {
      throw new Error("FORBIDDEN");
    }

    const existing = await StampRepo.findByBookingId(bookingId);
    if (existing) {
      throw new Error("DUPLICATE_STAMP");
    }

    await PassportSvc.issueStamp(bookingId);
    return StampRepo.findByBookingId(bookingId);
  }

  static async getStampsByUser(userId: string) {
    return StampRepo.findByUser(userId);
  }
}
