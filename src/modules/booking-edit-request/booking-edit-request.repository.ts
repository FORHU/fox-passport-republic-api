import { prisma } from "../../utils/prisma";
import { BookingEditRequestStatus, Prisma } from "@prisma/client";

export default class BookingEditRequestRepo {
  static async create(data: Prisma.BookingEditRequestUncheckedCreateInput) {
    return prisma.bookingEditRequest.create({ data });
  }

  static async findById(id: string) {
    return prisma.bookingEditRequest.findUnique({ where: { id } });
  }

  // The latest request for a booking, regardless of status — the caller
  // decides what "latest" means for its own UI (e.g. only show it if still
  // pending, or show the most recent resolved one too).
  static async findLatestForBooking(
    bookingKind: "asset" | "service",
    bookingId: string,
  ) {
    return prisma.bookingEditRequest.findFirst({
      where:
        bookingKind === "asset"
          ? { assetBookingId: bookingId }
          : { serviceBookingId: bookingId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async updateStatus(
    id: string,
    status: BookingEditRequestStatus,
    extra?: Prisma.BookingEditRequestUncheckedUpdateInput,
  ) {
    return prisma.bookingEditRequest.update({
      where: { id },
      data: { status, ...extra },
    });
  }
}
