import AssetRentalRepo from "../repositories/assetRental.repository";
import AssetRepo from "../repositories/asset.repository";

export default class AssetRentalSvc {
  static async rentAsset(assetId: string, _renterId?: string, _startDate?: Date, _endDate?: Date) {
    const asset = await AssetRepo.findAssetById(assetId);
    if (!asset) throw new Error("Asset not found");
    return AssetRentalRepo.createRental();
  }

  static async getRentalsForAsset(_assetId?: string) {
    return AssetRentalRepo.findRentalsByAsset();
  }

  static async getRentalById(_id?: string) {
    return AssetRentalRepo.findRentalById();
  }
}
