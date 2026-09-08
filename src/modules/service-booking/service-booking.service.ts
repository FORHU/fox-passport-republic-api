import ServiceBookingRepo from "./service-booking.repository";
import { prisma } from "../../utils/prisma";
import { ItemBookingStatus } from "@prisma/client";
import { calculateItemsTotal } from "../../utils/pricing";
import { PLATFORM_FEE_PERCENT } from "../../config";
import PayoutSvc from "../payout/payout.service";
import {
  announceToAdmins,
  announceToUser,
} from "../../infrastructure/socket/invalidate";

/** Mirrors `announceBookingChanged` in asset-booking.service.ts. */
function announceBookingChanged(
  bookerId: string | null | undefined,
  ownerId: string | null | undefined,
) {
  announceToUser(bookerId, "bookings");
  if (ownerId && ownerId !== bookerId) announceToUser(ownerId, "bookings");
  announceToAdmins("bookings");
}

export default class ServiceBookingSvc {
  static async getAvailability(serviceId: string) {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!service) throw new Error("Service not found");
    const bookedDates = await ServiceBookingRepo.getBookedDates(serviceId);
    return { bookedDates };
  }

  // NOTE: totalAmount is never accepted from the client — always computed
  // server-side from the service's own price/billingRate. See
  // docs/adr/0001-host-markup-and-server-computed-event-total.md
  static async create(data: {
    serviceId: string;
    userId: string;
    scheduledDate: string;
    endDate?: string;
    guestCount?: number;
    location: string;
    notes?: string;
  }) {
    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
    });
    if (!service || service.deletedAt)
      throw new Error("Service not found or unavailable");

    const scheduledDate = new Date(data.scheduledDate);
    const endDate = data.endDate ? new Date(data.endDate) : scheduledDate;

    const itemsTotal = calculateItemsTotal({
      price: service.price.toNumber(),
      quantity: 1,
      startDate: scheduledDate,
      endDate,
      billingRate: service.billingRate,
    });
    // service_lower_fees perk: service foxer owner pays 0% platform commission
    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const ownerHasLowerFees = await PassportSvc.hasPerk(
      service.ownerId,
      "service_lower_fees",
    );
    const effectiveFeePercent = ownerHasLowerFees ? 0 : PLATFORM_FEE_PERCENT;
    const platformFeeAmount = itemsTotal * (effectiveFeePercent / 100);
    const totalAmount = itemsTotal + platformFeeAmount;

    const booking = await ServiceBookingRepo.create({
      serviceId: data.serviceId,
      userId: data.userId,
      scheduledDate,
      endDate: data.endDate ? endDate : undefined,
      guestCount: data.guestCount,
      location: data.location,
      notes: data.notes,
      totalAmount,
      platformFeeAmount,
    });

    announceBookingChanged(data.userId, service.ownerId);
    return booking;
  }

  static async getAll(filters?: {
    userId?: string;
    ownerId?: string;
    status?: string;
  }) {
    return ServiceBookingRepo.findAll({
      userId: filters?.userId,
      ownerId: filters?.ownerId,
      status: filters?.status as ItemBookingStatus | undefined,
    });
  }

  static async getById(id: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    return booking;
  }

  static async confirmPayment(
    id: string,
    transactionId: string,
    method: string,
    requesterId: string,
  ) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId) throw new Error("Unauthorized");
    if (booking.status === ItemBookingStatus.cancelled)
      throw new Error("Booking is cancelled");

    const confirmed = await ServiceBookingRepo.confirmPayment(
      id,
      transactionId,
      method,
    );
    announceBookingChanged(booking.userId, booking.service?.ownerId);
    return confirmed;
  }

  static async updateStatus(id: string, status: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");

    const isOwner = booking.service?.owner?.id === requesterId;
    const isBooker = booking.userId === requesterId;
    if (!isOwner && !isBooker) throw new Error("Unauthorized");

    const updated = await ServiceBookingRepo.updateStatus(
      id,
      status as ItemBookingStatus,
    );

    if (status === ItemBookingStatus.completed) {
      try {
        await PayoutSvc.createPayoutsForServiceBooking(id);
      } catch (err) {
        console.error(`Payout failed for service booking ${id}`, err);
      }
      import("../passport/passport.service")
        .then(({ default: PassportSvc, XP_REWARDS, UserPath }) => {
          const ownerId =
            booking.service?.ownerId ?? booking.service?.owner?.id;
          if (ownerId)
            return PassportSvc.awardXP(
              ownerId,
              UserPath.serviceFoxer,
              XP_REWARDS.listingBooked,
            );
        })
        .catch(() => {});
      import("../users/specialization.service")
        .then(({ default: SpecializationSvc }) => {
          const serviceId = booking.service?.id ?? booking.serviceId;
          const ownerId =
            booking.service?.ownerId ?? booking.service?.owner?.id;
          if (serviceId && ownerId)
            return SpecializationSvc.checkServiceFoxer(serviceId, ownerId);
        })
        .catch(() => {});
    }

    announceBookingChanged(booking.userId, booking.service?.ownerId);
    return updated;
  }

  static async cancel(id: string, requesterId: string) {
    return this.updateStatus(id, ItemBookingStatus.cancelled, requesterId);
  }

  static async confirmArrival(id: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can confirm arrival");
    if (!["confirmed", "pending"].includes(booking.status))
      throw new Error("Booking cannot be confirmed at this stage");
    const confirmed = await ServiceBookingRepo.confirmArrival(id);
    announceBookingChanged(booking.userId, booking.service?.ownerId);
    return confirmed;
  }

  static async dispute(id: string, requesterId: string, reason?: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can report a dispute");
    if (["completed", "cancelled", "disputed"].includes(booking.status))
      throw new Error("Booking cannot be disputed at this stage");
    const disputed = await ServiceBookingRepo.dispute(id, reason);
    announceBookingChanged(booking.userId, booking.service?.ownerId);
    // This is the only way a row reaches /admin/service-bookings/disputes.
    announceToAdmins("disputes");
    return disputed;
  }
}
