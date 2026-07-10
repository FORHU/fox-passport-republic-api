import StampRepo from "../repositories/stamp.repository";

export default class StampSvc {
  static async createStamp(userId: string, bookingId: string) {
    const existing = await StampRepo.findByBookingId(bookingId);
    if (existing) {
      throw new Error("DUPLICATE_STAMP");
    }

    const booking = await StampRepo.getBookingWithEvent(bookingId);
    if (!booking) {
      throw new Error("BOOKING_NOT_FOUND");
    }

    if (booking.userId !== userId) {
      throw new Error("FORBIDDEN");
    }

    const event = booking.event;
    const imageUrl = event?.template?.images?.[0]?.url ?? "";
    const eventName = event?.name ?? "";
    const templateId = event?.templateId ?? null;

    return StampRepo.create({
      userId,
      bookingId,
      templateId,
      imageUrl,
      eventName,
    });
  }

  static async getStampsByUser(userId: string) {
    return StampRepo.findByUser(userId);
  }
}
