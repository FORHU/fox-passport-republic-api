import { prisma } from "../utils/prisma";
import { TransactionStatus } from "@prisma/client";

export default class EventTransactionRepo {
  // ASSETS
  static async findAssetTransactionsByProvider(providerId: string) {
    return prisma.eventAssetTransaction.findMany({
      where: { providerId },
      include: {
        event: { select: { name: true, startAt: true, client: { select: { name: true } } } },
        asset: { select: { name: true, images: true } },
      },
    });
  }

  static async updateAssetStatus(id: string, status: TransactionStatus) {
    return prisma.eventAssetTransaction.update({
      where: { id },
      data: { status },
    });
  }

  // SERVICES
  static async findServiceTransactionsByProvider(providerId: string) {
    return prisma.eventServiceTransaction.findMany({
      where: { providerId },
      include: {
        event: { select: { name: true, startAt: true, client: { select: { name: true } } } },
        service: { select: { name: true, images: true } },
      },
    });
  }

  static async updateServiceStatus(id: string, status: TransactionStatus) {
    return prisma.eventServiceTransaction.update({
      where: { id },
      data: { status },
    });
  }

  // VENUES
  static async findVenueTransactionsByProvider(providerId: string) {
    return prisma.eventVenueTransaction.findMany({
      where: { providerId },
      include: {
        event: { select: { name: true, startAt: true, client: { select: { name: true } } } },
        venue: { select: { name: true, images: true } },
      },
    });
  }

  static async updateVenueStatus(id: string, status: TransactionStatus) {
    return prisma.eventVenueTransaction.update({
      where: { id },
      data: { status },
    });
  }
}
