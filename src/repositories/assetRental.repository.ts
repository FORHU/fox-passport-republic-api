import { prisma } from "../utils/prisma";

export default class AssetRentalRepo {
  static async createRental(data: {
    assetId: number;
    renterId: number;
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

  static async findRentalById(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Invalid rental id");
    }
    return prisma.assetRental.findUnique({
      where: { id },
      include: { asset: true, renter: true },
    });
  }

  static async findRentalsByAsset(assetId: number) {
    return prisma.assetRental.findMany({
      where: { assetId },
      include: { renter: true },
      orderBy: { startDate: "asc" },
    });
  }

  static async updateRentalStatus(id: number, status: "pending" | "active" | "completed" | "cancelled") {
    return prisma.assetRental.update({
      where: { id },
      data: { status },
    });
  }
}
