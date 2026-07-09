import { prisma } from "../utils/prisma";
import { Prisma } from "@prisma/client";

export default class EventRequestRepo {
  static async create(data: Prisma.EventCreateInput) {
    return prisma.event.create({
      data,
      include: {
        assetTransactions: true,
        serviceTransactions: true,
        venueTransactions: true,
      },
    });
  }

  // Shared template include (images come from the template)
  private static readonly templateInclude = {
    select: {
      name: true,
      category: true,
      images: true,
    },
  } as const;

  // Public landing page — approved events only
  static async findAllApproved() {
    return prisma.event.findMany({
      where: { requestStatus: "approved" },
      include: {
        template: EventRequestRepo.templateInclude,
        host: { select: { name: true, email: true } },
      },
      orderBy: { startAt: "asc" },
    });
  }

  // Authenticated — own events (as client or host)
  static async findAll(filters: { clientId?: string; organizerId?: string }) {
    return prisma.event.findMany({
      where: {
        ...(filters.clientId && { clientId: filters.clientId }),
        ...(filters.organizerId && { organizerId: filters.organizerId }),
      },
      include: {
        template: EventRequestRepo.templateInclude,
        client: { select: { name: true, email: true } },
        host: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Admin — all events with any status
  static async findAllAdmin(filters?: { requestStatus?: string }) {
    return prisma.event.findMany({
      where: {
        ...(filters?.requestStatus && {
          requestStatus: filters.requestStatus as any,
        }),
      },
      include: {
        template: EventRequestRepo.templateInclude,
        client: { select: { name: true, email: true } },
        host: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async findById(id: string) {
    return prisma.event.findUnique({
      where: { id },
      include: {
        template: { include: { images: true } },
        client: { select: { name: true, email: true } },
        host: { select: { name: true, email: true } },
        assetTransactions: {
          include: {
            asset: { include: { images: true } },
            provider: { select: { name: true } },
          },
        },
        serviceTransactions: {
          include: {
            service: { include: { images: true } },
            provider: { select: { name: true } },
          },
        },
        venueTransactions: {
          include: {
            venue: { include: { images: true } },
            provider: { select: { name: true } },
          },
        },
        bookings: true,
      },
    });
  }

  static async updateStatus(id: string, status: any) {
    return prisma.event.update({
      where: { id },
      data: { eventStatus: status },
    });
  }

  static async updateRequestStatus(id: string, status: any) {
    return prisma.event.update({
      where: { id },
      data: { requestStatus: status },
    });
  }

  static async rejectRequest(id: string, reason?: string) {
    return prisma.event.update({
      where: { id },
      data: { requestStatus: "rejected", rejectionReason: reason ?? null },
    });
  }
}
