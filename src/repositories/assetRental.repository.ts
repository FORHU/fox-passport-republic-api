/**
 * NOTE:
 * The current `prisma/schema.prisma` has no `AssetRental` model.
 * This repository is kept only to avoid breaking imports in higher layers,
 * but all methods throw until rentals are reintroduced to the schema.
 */
export default class AssetRentalRepo {
  static async createRental(): Promise<never> {
    throw new Error("Asset rentals are not supported by the current schema");
  }

  static async findRentalById(): Promise<never> {
    throw new Error("Asset rentals are not supported by the current schema");
  }

  static async findRentalsByAsset(): Promise<never> {
    throw new Error("Asset rentals are not supported by the current schema");
  }

  static async updateRentalStatus(): Promise<never> {
    throw new Error("Asset rentals are not supported by the current schema");
  }
}
