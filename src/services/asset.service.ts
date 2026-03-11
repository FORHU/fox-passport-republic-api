import AssetRepo from "../repositories/asset.repository";

export default class AssetSvc {
  static async createAsset(data: {
    ownerId: number;
    hostId: number;
    categoryId?: number;
    name: string;
    description: string;
    condition?: "new" | "good" | "fair" | "refurbished";
    propertyType?: string;
    roomType?: string;
    capacity?: number;
    maxAttendees?: number;
    images?: { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean }[];
  }) {
    const asset = await AssetRepo.createAsset(data);
    return asset;
  }

  static async getAssets(filters?: { ownerId?: number; categoryId?: number }) {
    return AssetRepo.findAllAssets(filters);
  }

  static async getAssetById(id: number) {
    const asset = await AssetRepo.findAssetById(id);
    if (!asset) {
      throw new Error("Asset not found");
    }
    return asset;
  }

  static async updateAsset(
    id: number,
    ownerId: number,
    data: Partial<{
      hostId: number;
      categoryId?: number | null;
      name: string;
      description: string;
      condition?: "new" | "good" | "fair" | "refurbished";
      propertyType?: string;
      roomType?: string;
      capacity?: number;
      maxAttendees?: number;
      images?: { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean }[];
    }>
  ) {
    const existing = await AssetRepo.findAssetById(id);
    if (!existing) {
      throw new Error("Asset not found");
    }
    if (existing.ownerId !== ownerId) {
      throw new Error("Unauthorized");
    }


    return AssetRepo.updateAsset(id, data);
  }

   static async deleteAsset(id: number, requesterId: number) {
    const asset = await AssetRepo.findAssetById(id);

    if (!asset) {
      throw new Error("Asset not found");
    }

    // Only the owner can delete
    if (asset.ownerId !== requesterId) {
      throw new Error("You are not authorized to delete this asset");
    }

    await AssetRepo.deleteAsset(id);
    return { message: "Asset deleted successfully" };
  }
}