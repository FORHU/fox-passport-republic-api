import { prisma } from "../utils/prisma";
import { ItemBookingStatus, PaymentStatus } from "@prisma/client";

export default class AssetBookingRepo {
  static async create(data: {
    assetId: string;
    userId: string;
    startDate: Date;
    endDate: Date;
    quantity: number;
    fulfillmentType: string;
    deliveryAddress?: string;
    notes?: string;
    totalAmount: number;
  }) {
    return prisma.assetBooking.create({
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
      },
      include: {
        asset: { include: { images: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async findAll(filters?: { userId?: string; ownerId?: string; status?: ItemBookingStatus }) {
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
        asset: { include: { images: true, owner: { select: { id: true, name: true, email: true } } } },
        user: { select: { id: true, name: true, email: true } },
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

  static async confirmPayment(id: string, transactionId: string, method: string) {
    return prisma.assetBooking.update({
      where: { id },
      data: {
        status: ItemBookingStatus.confirmed,
        paymentStatus: PaymentStatus.completed,
        paymentTransactionId: transactionId,
        paymentMethod: method,
      },
      include: {
        asset: { include: { images: true, owner: { select: { id: true, name: true, email: true } } } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async getBookedRanges(assetId: string) {
    const [bookings, asset] = await Promise.all([
      prisma.assetBooking.findMany({
        where: {
          assetId,
          status: { notIn: ["cancelled", "disputed"] },
          endDate: { gte: new Date() },
        },
        select: { startDate: true, endDate: true, quantity: true },
      }),
      prisma.asset.findUnique({ where: { id: assetId }, select: { quantity: true } }),
    ]);
    return {
      bookedRanges: bookings.map((b) => ({
        startDate: b.startDate.toISOString().split("T")[0],
        endDate: b.endDate.toISOString().split("T")[0],
        bookedQty: b.quantity,
      })),
      totalQty: asset?.quantity ?? 0,
    };
  }

  static async confirmArrival(id: string) {
    return prisma.assetBooking.update({
      where: { id },
      data: { status: ItemBookingStatus.active },
      include: {
        asset: { include: { images: true, owner: { select: { id: true, name: true, email: true } } } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async dispute(id: string) {
    return prisma.assetBooking.update({
      where: { id },
      data: { status: ItemBookingStatus.disputed },
      include: {
        asset: { include: { images: true, owner: { select: { id: true, name: true, email: true } } } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }
}
