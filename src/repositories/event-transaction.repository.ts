import { prisma } from "../utils/prisma";
import { Prisma, TransactionStatus } from "@prisma/client";

export default class EventTransactionRepo {
  // ASSETS
  static async findAssetTransactionsByProvider(providerId: string) {
    return prisma.eventAssetTransaction.findMany({
      where: { providerId },
      include: {
        event: {
          select: {
            name: true,
            startAt: true,
            client: { select: { name: true } },
          },
        },
        asset: { select: { name: true, images: true } },
      },
    });
  }

  static async createAssetTransaction(
    data: Prisma.EventAssetTransactionUncheckedCreateInput,
  ) {
    return prisma.eventAssetTransaction.create({ data });
  }

  static async updateAssetStatus(
    id: string,
    status: TransactionStatus,
    agreedPrice?: number,
    providerId?: string,
  ) {
    return prisma.eventAssetTransaction.update({
      where: { id, ...(providerId && { providerId }) },
      data: { status, ...(agreedPrice !== undefined && { agreedPrice }) },
    });
  }

  // SERVICES
  static async findServiceTransactionsByProvider(providerId: string) {
    return prisma.eventServiceTransaction.findMany({
      where: { providerId },
      include: {
        event: {
          select: {
            name: true,
            startAt: true,
            client: { select: { name: true } },
          },
        },
        service: { select: { name: true, images: true } },
      },
    });
  }

  static async createServiceTransaction(
    data: Prisma.EventServiceTransactionUncheckedCreateInput,
  ) {
    return prisma.eventServiceTransaction.create({ data });
  }

  static async updateServiceStatus(
    id: string,
    status: TransactionStatus,
    agreedPrice?: number,
    providerId?: string,
  ) {
    return prisma.eventServiceTransaction.update({
      where: { id, ...(providerId && { providerId }) },
      data: { status, ...(agreedPrice !== undefined && { agreedPrice }) },
    });
  }

  // VENUES
  static async findVenueTransactionsByProvider(providerId: string) {
    return prisma.eventVenueTransaction.findMany({
      where: { providerId },
      include: {
        event: {
          select: {
            name: true,
            startAt: true,
            client: { select: { name: true } },
          },
        },
        venue: { select: { name: true, images: true } },
      },
    });
  }

  static async createVenueTransaction(
    data: Prisma.EventVenueTransactionUncheckedCreateInput,
  ) {
    return prisma.eventVenueTransaction.create({ data });
  }

  static async updateVenueStatus(
    id: string,
    status: TransactionStatus,
    agreedPrice?: number,
    providerId?: string,
  ) {
    return prisma.eventVenueTransaction.update({
      where: { id, ...(providerId && { providerId }) },
      data: { status, ...(agreedPrice !== undefined && { agreedPrice }) },
    });
  }
}
