import ServiceBookingRepo from "../repositories/service-booking.repository";
import { prisma } from "../utils/prisma";
import { ItemBookingStatus } from "@prisma/client";

export default class ServiceBookingSvc {
  static async getAvailability(serviceId: string) {
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new Error("Service not found");
    const bookedDates = await ServiceBookingRepo.getBookedDates(serviceId);
    return { bookedDates };
  }

  static async create(data: {
    serviceId: string;
    userId: string;
    scheduledDate: string;
    endDate?: string;
    guestCount?: number;
    location: string;
    notes?: string;
    totalAmount: number;
  }) {
    const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
    if (!service || service.deletedAt) throw new Error("Service not found or unavailable");

    return ServiceBookingRepo.create({
      serviceId: data.serviceId,
      userId: data.userId,
      scheduledDate: new Date(data.scheduledDate),
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      guestCount: data.guestCount,
      location: data.location,
      notes: data.notes,
      totalAmount: data.totalAmount,
    });
  }

  static async getAll(filters?: { userId?: string; ownerId?: string; status?: string }) {
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

  static async confirmPayment(id: string, transactionId: string, method: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId) throw new Error("Unauthorized");
    if (booking.status === ItemBookingStatus.cancelled) throw new Error("Booking is cancelled");

    return ServiceBookingRepo.confirmPayment(id, transactionId, method);
  }

  static async updateStatus(id: string, status: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");

    const isOwner = (booking.service as any)?.owner?.id === requesterId;
    const isBooker = booking.userId === requesterId;
    if (!isOwner && !isBooker) throw new Error("Unauthorized");

    return ServiceBookingRepo.updateStatus(id, status as ItemBookingStatus);
  }

  static async cancel(id: string, requesterId: string) {
    return this.updateStatus(id, ItemBookingStatus.cancelled, requesterId);
  }

  static async confirmArrival(id: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId) throw new Error("Only the client can confirm arrival");
    if (!["confirmed", "pending"].includes(booking.status)) throw new Error("Booking cannot be confirmed at this stage");
    return ServiceBookingRepo.confirmArrival(id);
  }

  static async dispute(id: string, requesterId: string) {
    const booking = await ServiceBookingRepo.findById(id);
    if (!booking) throw new Error("Service booking not found");
    if (booking.userId !== requesterId) throw new Error("Only the client can report a dispute");
    if (["completed", "cancelled", "disputed"].includes(booking.status)) throw new Error("Booking cannot be disputed at this stage");
    return ServiceBookingRepo.dispute(id);
  }
}
