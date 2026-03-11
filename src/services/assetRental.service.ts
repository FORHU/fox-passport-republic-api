import AssetRentalRepo from "../repositories/assetRental.repository";
import AssetRepo from "../repositories/asset.repository";

export default class AssetRentalSvc {
  // create a new rental for an asset
  static async rentAsset(
    assetId: number,
    renterId: number,
    startDate: Date,
    endDate: Date
  ) {
    // ensure asset exists and is not deleted
    const asset = await AssetRepo.findAssetById(assetId);
    if (!asset) {
      throw new Error("Asset not found");
    }
    if (asset.ownerId === renterId) {
      throw new Error("Owner cannot rent their own asset");
    }

    // simple availability check: make sure requested range does not overlap existing active or pending rentals
    const existing = await AssetRentalRepo.findRentalsByAsset(assetId);
    for (const r of existing) {
      if (
        (startDate >= r.startDate && startDate < r.endDate) ||
        (endDate > r.startDate && endDate <= r.endDate) ||
        (startDate <= r.startDate && endDate >= r.endDate)
      ) {
        if (r.status !== "cancelled" && r.status !== "completed") {
          throw new Error("Asset is already rented for the selected period");
        }
      }
    }

    const rental = await AssetRentalRepo.createRental({
      assetId,
      renterId,
      startDate,
      endDate,
    });
    return rental;
  }

  static async getRentalsForAsset(assetId: number) {
    return AssetRentalRepo.findRentalsByAsset(assetId);
  }

  static async getRentalById(id: number) {
    const rental = await AssetRentalRepo.findRentalById(id);
    if (!rental) {
      throw new Error("Rental not found");
    }
    return rental;
  }
}
