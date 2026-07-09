import ServiceBookingRepo from "../repositories/service-booking.repository";
import { prisma } from "../utils/prisma";
import { ItemBookingStatus } from "@prisma/client";
import { calculateItemsTotal } from "../utils/pricing";
import { PLATFORM_FEE_PERCENT } from "../config";
import PayoutSvc from "./payout.service";

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
      price: service.price,
      quantity: 1,
      startDate: scheduledDate,
      endDate,
      billingRate: service.billingRate,
    });
    const platformFeeAmount = itemsTotal * (PLATFORM_FEE_PERCENT / 100);
    const totalAmount = itemsTotal + platformFeeAmount;

    return ServiceBookingRepo.create({
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

    return ServiceBookingRepo.confirmPayment(id, transactionId, method);
  }

  static async updateStatus(id: string, status: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");

    const isOwner = (booking.service as any)?.owner?.id === requesterId;
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
    }

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
    return ServiceBookingRepo.confirmArrival(id);
  }

  static async dispute(id: string, requesterId: string, reason?: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId)
      throw new Error("Only the client can report a dispute");
    if (["completed", "cancelled", "disputed"].includes(booking.status))
      throw new Error("Booking cannot be disputed at this stage");
    return ServiceBookingRepo.dispute(id, reason);
  }
}
