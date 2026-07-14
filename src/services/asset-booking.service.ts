import AssetBookingRepo from "../repositories/asset-booking.repository";
import { prisma } from "../utils/prisma";
import { ItemBookingStatus } from "@prisma/client";
import { calculateItemsTotal } from "../utils/pricing";
import { PLATFORM_FEE_PERCENT } from "../config";
import PayoutSvc from "./payout.service";

export default class AssetBookingSvc {
  static async getAvailability(assetId: string) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new Error("Asset not found");
    return AssetBookingRepo.getBookedRanges(assetId);
  }

  // NOTE: totalAmount is never accepted from the client — always computed
  // server-side from the asset's own price/billingRate. See
  // docs/adr/0001-host-markup-and-server-computed-event-total.md
  static async create(data: {
    assetId: string;
    userId: string;
    startDate: string;
    endDate: string;
    quantity: number;
    fulfillmentType: string;
    deliveryAddress?: string;
    notes?: string;
  }) {
    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
    });
    if (!asset || asset.deletedAt)
      throw new Error("Asset not found or unavailable");

    if (data.quantity > asset.quantity) {
      throw new Error(`Only ${asset.quantity} unit(s) available`);
    }

    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    const itemsTotal = calculateItemsTotal({
      price: asset.price,
      quantity: data.quantity,
      startDate,
      endDate,
      billingRate: asset.billingRate,
    });
    // lower_fees perk: gear foxer owner pays 0% platform commission
    const { default: PassportSvc } = await import("./passport.service");
    const ownerHasLowerFees = await PassportSvc.hasPerk(asset.ownerId, "lower_fees");
    const effectiveFeePercent = ownerHasLowerFees ? 0 : PLATFORM_FEE_PERCENT;
    const platformFeeAmount = itemsTotal * (effectiveFeePercent / 100);
    const totalAmount = itemsTotal + platformFeeAmount;

    return AssetBookingRepo.create({
      assetId: data.assetId,
      userId: data.userId,
      startDate,
      endDate,
      quantity: data.quantity,
      fulfillmentType: data.fulfillmentType,
      deliveryAddress: data.deliveryAddress,
      notes: data.notes,
      totalAmount,
      platformFeeAmount,
    });
  }

  static async getAll(filters?: {
    userId?: string;
    ownerId?: string;
    status?: string;
  }) {
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

  static async confirmPayment(
    id: string,
    transactionId: string,
    method: string,
    requesterId: string,
  ) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId) throw new Error("Unauthorized");
    if (booking.status === ItemBookingStatus.cancelled)
      throw new Error("Booking is cancelled");

    return AssetBookingRepo.confirmPayment(id, transactionId, method);
  }

  static async updateStatus(id: string, status: string, requesterId: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");

    const isOwner = (booking.asset as any)?.owner?.id === requesterId;
    const isBooker = booking.userId === requesterId;
    if (!isOwner && !isBooker) throw new Error("Unauthorized");

    const updated = await AssetBookingRepo.updateStatus(
      id,
      status as ItemBookingStatus,
    );

    if (status === ItemBookingStatus.completed) {
      try {
        await PayoutSvc.createPayoutsForAssetBooking(id);
      } catch (err) {
        console.error(`Payout failed for asset booking ${id}`, err);
      }
      import("./passport.service").then(({ default: PassportSvc, XP_REWARDS, UserPath }) => {
        const ownerId = (booking.asset as any)?.ownerId ?? (booking.asset as any)?.owner?.id;
        if (ownerId) return PassportSvc.awardXP(ownerId, UserPath.gearFoxer, XP_REWARDS.listingBooked);
      }).catch(() => {});
    }

    return updated;
  }

  static async cancel(id: string, requesterId: string) {
    return this.updateStatus(id, ItemBookingStatus.cancelled, requesterId);
  }

  static async confirmArrival(id: string, requesterId: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can confirm arrival");
    if (!["confirmed", "pending"].includes(booking.status))
      throw new Error("Booking cannot be confirmed at this stage");
    return AssetBookingRepo.confirmArrival(id);
  }

  static async dispute(id: string, requesterId: string, reason?: string) {
    const booking = await AssetBookingRepo.findById(id);
    if (!booking) throw new Error("Asset booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can report a dispute");
    if (["completed", "cancelled", "disputed"].includes(booking.status))
      throw new Error("Booking cannot be disputed at this stage");
    return AssetBookingRepo.dispute(id, reason);
  }
}
