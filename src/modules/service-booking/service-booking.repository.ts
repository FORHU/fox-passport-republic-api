import { prisma, AppTransactionClient } from "../../utils/prisma";
import { ItemBookingStatus, PaymentStatus } from "@prisma/client";
import { RESERVING_TRANSACTION_STATUSES } from "../availability/availability.types";

export default class ServiceBookingRepo {
  static async create(
    data: {
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
    },
    tx: AppTransactionClient = prisma,
  ) {
    return tx.serviceBooking.create({
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

  /**
   * Booked days for the citizen-facing calendar — direct bookings
   * (`serviceBooking`) alone used to be the whole answer (and only their
   * `scheduledDate`, ignoring a multi-day booking's own `endDate`), which
   * left both template-booked events (`eventServiceTransaction`) and the
   * later days of a multi-day direct booking invisible here. Both sources
   * feed the same calendar, so both are queried and fully expanded,
   * mirroring `AvailabilitySvc.lockAndCheckService`.
   */
  static async getBookedDates(serviceId: string): Promise<string[]> {
    const now = new Date();
    const [directBookings, templateReservations] = await Promise.all([
      prisma.serviceBooking.findMany({
        where: {
          serviceId,
          status: { notIn: ["cancelled", "disputed"] },
          OR: [
            { endDate: { gte: now } },
            { endDate: null, scheduledDate: { gte: now } },
          ],
        },
        select: { scheduledDate: true, endDate: true },
      }),
      prisma.eventServiceTransaction.findMany({
        where: {
          serviceId,
          status: { in: [...RESERVING_TRANSACTION_STATUSES] },
          event: { endAt: { gte: now } },
        },
        select: { event: { select: { startAt: true, endAt: true } } },
      }),
    ]);

    const days = new Set<string>();
    const addRange = (start: Date, end: Date) => {
      const cursor = new Date(start);
      cursor.setUTCHours(0, 0, 0, 0);
      const last = new Date(end);
      last.setUTCHours(0, 0, 0, 0);
      while (cursor <= last) {
        days.add(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    };

    for (const b of directBookings) {
      addRange(b.scheduledDate, b.endDate ?? b.scheduledDate);
    }
    for (const r of templateReservations) {
      addRange(r.event.startAt, r.event.endAt);
    }

    return [...days].sort();
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
