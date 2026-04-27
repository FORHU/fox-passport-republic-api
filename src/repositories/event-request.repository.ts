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

  static async findAll(filters: { clientId?: string; organizerId?: string }) {
    return prisma.event.findMany({
      where: {
        ...(filters.clientId && { clientId: filters.clientId }),
        ...(filters.organizerId && { organizerId: filters.organizerId }),
      },
      include: {
        template: { select: { name: true, category: true } },
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
        template: true,
        client: { select: { name: true, email: true } },
        host: { select: { name: true, email: true } },
        assetTransactions: { include: { asset: true, provider: { select: { name: true } } } },
        serviceTransactions: { include: { service: true, provider: { select: { name: true } } } },
        venueTransactions: { include: { venue: true, provider: { select: { name: true } } } },
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
}
