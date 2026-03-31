import { RentalStatus } from "@prisma/client";
import { prisma } from "../utils/prisma";

export default class AssetRentalRepo {
  static async createRental(data: {
    assetId: string;
    renterId: string;
    startDate: Date;
    endDate: Date;
  }) {
    return prisma.assetRental.create({
      data: {
        assetId: data.assetId,
        renterId: data.renterId,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    });
  }

  static async findRentalById(id: string) {
    return prisma.assetRental.findUnique({
      where: { id },
      include: { asset: true, renter: true },
    });
  }

  static async findRentalsByAsset(assetId: string) {
    return prisma.assetRental.findMany({
      where: { assetId },
      include: { renter: true },
      orderBy: { startDate: "asc" },
    });
  }

  static async updateRentalStatus(id: string, status: RentalStatus) {
    return prisma.assetRental.update({
      where: { id },
      data: { status },
    });
  }
}
