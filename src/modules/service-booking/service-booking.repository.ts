import { prisma } from "../../utils/prisma";
import { ItemBookingStatus, PaymentStatus } from "@prisma/client";

export default class ServiceBookingRepo {
  static async create(data: {
    serviceId: string;
    userId: string;
    scheduledDate: Date;
    endDate?: Date;
    guestCount?: number;
    location: string;
    notes?: string;
    totalAmount: number;
    platformFeeAmount: number;
    discountAmount?: number;
    voucherId?: string | null;
  }) {
    return prisma.serviceBooking.create({
      data: {
        serviceId: data.serviceId,
        userId: data.userId,
        scheduledDate: data.scheduledDate,
        endDate: data.endDate,
        guestCount: data.guestCount ?? 1,
        location: data.location,
        notes: data.notes,
        totalAmount: data.totalAmount,
        platformFeeAmount: data.platformFeeAmount,
        discountAmount: data.discountAmount ?? 0,
        voucherId: data.voucherId ?? null,
      },
      include: {
        service: { include: { images: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async findAll(filters?: {
    userId?: string;
    ownerId?: string;
    status?: ItemBookingStatus;
  }) {
    return prisma.serviceBooking.findMany({
      where: {
        ...(filters?.userId && { userId: filters.userId }),
        ...(filters?.ownerId && { service: { ownerId: filters.ownerId } }),
        ...(filters?.status && { status: filters.status }),
      },
      include: {
        service: { include: { images: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findById(id: string) {
    return prisma.serviceBooking.findUnique({
      where: { id },
      include: {
        service: {
          include: {
            images: true,
            owner: { select: { id: true, name: true, email: true } },
            cancellationPolicy: { include: { rules: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async updateStatus(id: string, status: ItemBookingStatus) {
    return prisma.serviceBooking.update({
      where: { id },
      data: { status },
      include: {
        service: { include: { images: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async confirmPayment(
    id: string,
    transactionId: string,
    method: string,
  ) {
    return prisma.serviceBooking.update({
      where: { id },
      data: {
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.paid,
        paymentTransactionId: transactionId,
        paymentMethod: method,
      },
      include: {
        service: {
          include: {
            images: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async getBookedDates(serviceId: string): Promise<string[]> {
    const bookings = await prisma.serviceBooking.findMany({
      where: {
        serviceId,
        status: { notIn: ["cancelled", "disputed"] },
      },
      select: { scheduledDate: true },
    });
    return bookings.map((b) => b.scheduledDate.toISOString().split("T")[0]);
  }

  static async confirmArrival(id: string) {
    return prisma.serviceBooking.update({
      where: { id },
      data: { status: ItemBookingStatus.active },
      include: {
        service: {
          include: {
            images: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async dispute(id: string, reason?: string) {
    return prisma.serviceBooking.update({
      where: { id },
      data: {
        status: ItemBookingStatus.disputed,
        disputeReason: reason ?? null,
        disputeAt: new Date(),
      },
      include: {
        service: {
          include: {
            images: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async providerCancel(id: string, reason: string) {
    return prisma.serviceBooking.update({
      where: { id },
      data: {
        status: ItemBookingStatus.cancelled,
        providerCancelledAt: new Date(),
        providerCancelReason: reason,
      },
      include: {
        service: {
          include: {
            images: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /** The citizen's own cancellation — see ServiceBookingSvc.cancelWithRefund. */
  static async cancel(id: string) {
    return prisma.serviceBooking.update({
      where: { id },
      data: { status: ItemBookingStatus.cancelled },
      include: {
        service: {
          include: {
            images: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }
}
