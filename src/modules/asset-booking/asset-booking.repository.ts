import { prisma, AppTransactionClient } from "../../utils/prisma";
import { ItemBookingStatus, PaymentStatus } from "@prisma/client";
import { RESERVING_TRANSACTION_STATUSES } from "../availability/availability.types";

export default class AssetBookingRepo {
  static async create(
    data: {
      assetId: string;
      userId: string;
      startDate: Date;
      endDate: Date;
      quantity: number;
      fulfillmentType: string;
      deliveryAddress?: string;
      notes?: string;
      totalAmount: number;
      platformFeeAmount: number;
      discountAmount?: number;
      voucherId?: string | null;
    },
    tx: AppTransactionClient = prisma,
  ) {
    return tx.assetBooking.create({
      data: {
        assetId: data.assetId,
        userId: data.userId,
        startDate: data.startDate,
        endDate: data.endDate,
        quantity: data.quantity,
        fulfillmentType: data.fulfillmentType,
        deliveryAddress: data.deliveryAddress,
        notes: data.notes,
        totalAmount: data.totalAmount,
        platformFeeAmount: data.platformFeeAmount,
        discountAmount: data.discountAmount ?? 0,
        voucherId: data.voucherId ?? null,
      },
      include: {
        asset: { include: { images: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async findAll(filters?: {
    userId?: string;
    ownerId?: string;
    status?: ItemBookingStatus;
  }) {
    return prisma.assetBooking.findMany({
      where: {
        ...(filters?.userId && { userId: filters.userId }),
        ...(filters?.ownerId && { asset: { ownerId: filters.ownerId } }),
        ...(filters?.status && { status: filters.status }),
      },
      include: {
        asset: { include: { images: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findById(id: string) {
    return prisma.assetBooking.findUnique({
      where: { id },
      include: {
        asset: {
          include: {
            images: true,
            owner: { select: { id: true, name: true, email: true } },
            cancellationPolicy: { include: { rules: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
        payments: {
          orderBy: { createdAt: "desc" },
        },
        refunds: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  static async updateStatus(id: string, status: ItemBookingStatus) {
    return prisma.assetBooking.update({
      where: { id },
      data: { status },
      include: {
        asset: { include: { images: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async confirmPayment(
    id: string,
    transactionId: string,
    method: string,
  ) {
    return prisma.assetBooking.update({
      where: { id },
      data: {
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.paid,
        paymentTransactionId: transactionId,
        paymentMethod: method,
      },
      include: {
        asset: {
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
   * Booked ranges for the citizen-facing calendar — direct bookings
   * (`assetBooking`) alone used to be the whole answer, which left every
   * template-booked event (`eventAssetTransaction`) invisible here: a
   * citizen would see a date as open, submit, and only find out it was
   * unavailable when `AvailabilitySvc` rejected the actual booking. Both
   * sources feed the same physical stock, so both are queried, mirroring
   * `AvailabilitySvc.lockAndCheckAsset`.
   */
  static async getBookedRanges(assetId: string) {
    const now = new Date();
    const [directBookings, templateReservations, asset] = await Promise.all([
      prisma.assetBooking.findMany({
        where: {
          assetId,
          status: { notIn: ["cancelled", "disputed"] },
          endDate: { gte: now },
        },
        select: { startDate: true, endDate: true, quantity: true },
      }),
      prisma.eventAssetTransaction.findMany({
        where: {
          assetId,
          status: { in: [...RESERVING_TRANSACTION_STATUSES] },
          event: { endAt: { gte: now } },
        },
        select: {
          quantity: true,
          event: { select: { startAt: true, endAt: true } },
        },
      }),
      prisma.asset.findUnique({
        where: { id: assetId },
        select: { quantity: true },
      }),
    ]);
    return {
      bookedRanges: [
        ...directBookings.map((b) => ({
          startDate: b.startDate.toISOString().split("T")[0],
          endDate: b.endDate.toISOString().split("T")[0],
          bookedQty: b.quantity,
        })),
        ...templateReservations.map((r) => ({
          startDate: r.event.startAt.toISOString().split("T")[0],
          endDate: r.event.endAt.toISOString().split("T")[0],
          bookedQty: r.quantity,
        })),
      ],
      totalQty: asset?.quantity ?? 0,
    };
  }

  static async confirmArrival(id: string) {
    return prisma.assetBooking.update({
      where: { id },
      data: { status: ItemBookingStatus.active },
      include: {
        asset: {
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
    return prisma.assetBooking.update({
      where: { id },
      data: {
        status: ItemBookingStatus.disputed,
        disputeReason: reason ?? null,
        disputeAt: new Date(),
      },
      include: {
        asset: {
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
    return prisma.assetBooking.update({
      where: { id },
      data: {
        status: ItemBookingStatus.cancelled,
        providerCancelledAt: new Date(),
        providerCancelReason: reason,
      },
      include: {
        asset: {
          include: {
            images: true,
            owner: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /** The citizen's own cancellation — see AssetBookingSvc.cancelWithRefund. */
  static async cancel(id: string) {
    return prisma.assetBooking.update({
      where: { id },
      data: { status: ItemBookingStatus.cancelled },
      include: {
        asset: {
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
