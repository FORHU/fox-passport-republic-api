import AssetBookingRepo from "../repositories/asset-booking.repository";
import { prisma } from "../utils/prisma";
import { ItemBookingStatus } from "@prisma/client";

export default class AssetBookingSvc {
  static async getAvailability(assetId: string) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new Error("Asset not found");
    return AssetBookingRepo.getBookedRanges(assetId);
  }

  static async create(data: {
    assetId: string;
    userId: string;
    startDate: string;
    endDate: string;
    quantity: number;
    fulfillmentType: string;
    deliveryAddress?: string;
    notes?: string;
    totalAmount: number;
  }) {
    const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
    if (!asset || asset.deletedAt) throw new Error("Asset not found or unavailable");

    if (data.quantity > asset.quantity) {
      throw new Error(`Only ${asset.quantity} unit(s) available`);
    }

    return AssetBookingRepo.create({
      assetId: data.assetId,
      userId: data.userId,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
      quantity: data.quantity,
      fulfillmentType: data.fulfillmentType,
      deliveryAddress: data.deliveryAddress,
      notes: data.notes,
      totalAmount: data.totalAmount,
    });
  }

  static async getAll(filters?: { userId?: string; ownerId?: string; status?: string }) {
    return AssetBookingRepo.findAll({
      userId: filters?.userId,
      ownerId: filters?.ownerId,
      status: filters?.status as ItemBookingStatus | undefined,
    });
  }

  static async getById(id: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    return booking;
  }

  static async confirmPayment(id: string, transactionId: string, method: string, requesterId: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId) throw new Error("Unauthorized");
    if (booking.status === ItemBookingStatus.cancelled) throw new Error("Booking is cancelled");

    return AssetBookingRepo.confirmPayment(id, transactionId, method);
  }

  static async updateStatus(id: string, status: string, requesterId: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");

    const isOwner = (booking.asset as any)?.owner?.id === requesterId;
    const isBooker = booking.userId === requesterId;
    if (!isOwner && !isBooker) throw new Error("Unauthorized");

    return AssetBookingRepo.updateStatus(id, status as ItemBookingStatus);
  }

  static async cancel(id: string, requesterId: string) {
    return this.updateStatus(id, ItemBookingStatus.cancelled, requesterId);
  }

  static async confirmArrival(id: string, requesterId: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId) throw new Error("Only the client can confirm arrival");
    if (!["confirmed", "pending"].includes(booking.status)) throw new Error("Booking cannot be confirmed at this stage");
    return AssetBookingRepo.confirmArrival(id);
  }

  static async dispute(id: string, requesterId: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId) throw new Error("Only the client can report a dispute");
    if (["completed", "cancelled", "disputed"].includes(booking.status)) throw new Error("Booking cannot be disputed at this stage");
    return AssetBookingRepo.dispute(id);
  }
}
