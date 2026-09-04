import {
  AssetCondition,
  BillingRate,
  AssetCategory,
  AssetStatus,
} from "@prisma/client";
import AssetRepo from "./asset.repository";
import { v4 as uuidv4 } from "uuid";

export default class AssetSvc {
  static async createAsset(data: {
    id?: string;
    ownerId: string;
    category: AssetCategory;
    name: string;
    description: string;
    quantity?: number;
    condition?: AssetCondition;
    price: number;
    currency?: string;
    billingRate?: BillingRate;
    status?: AssetStatus;
    imgIds: string[];
  }) {
    const normalized = {
      ...data,
      id: data.id ?? uuidv4(),
      quantity: data.quantity ?? 1,
      condition: data.condition ?? AssetCondition.good,
      currency: data.currency ?? "USD",
      status: data.status ?? AssetStatus.draft,
      billingRate: data.billingRate ?? BillingRate.daily,
    };

    if (!Array.isArray(data.imgIds) || data.imgIds.length === 0) {
      throw new Error("At least one image is required");
    }
    if (data.imgIds.length > 5) {
      throw new Error("A maximum of 5 images is allowed");
    }

    const assetData = {
      ...normalized,
      imgIds: data.imgIds,
    };

    const asset = await AssetRepo.createAsset(assetData);
    return asset;
  }

  static async getAssets(filters?: {
    ownerId?: string;
    category?: AssetCategory;
    city?: string;
    page?: number;
    limit?: number;
  }) {
    const { assets, total } = await AssetRepo.findAllAssets(filters);
    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const sorted = await PassportSvc.sortByFeaturedPerk(
      assets,
      "gear_featured",
      "ownerId",
    );
    const enriched = await PassportSvc.enrichWithOwnerBadge(
      sorted,
      "gear_verified",
      "ownerId",
    );
    return { assets: enriched, total };
  }

  static async browseAssets(filters: {
    ownerCity?: string;
    maxPrice?: number;
    page?: number;
    limit: number;
  }) {
    return AssetRepo.findPublicAssets(filters);
  }

  static async getAssetById(id: string) {
    const asset = await AssetRepo.findAssetById(id);
    if (!asset) throw new Error("Asset not found");
    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const [enriched] = await PassportSvc.enrichWithOwnerBadge(
      [asset],
      "gear_verified",
      "ownerId",
    );
    return enriched;
  }

  static async updateAsset(
    id: string,
    ownerId: string,
    data: Partial<{
      category: AssetCategory;
      name: string;
      description: string;
      quantity: number;
      condition?: AssetCondition;
      price?: number;
      currency?: string;
      billingRate?: BillingRate;
      status?: AssetStatus;
    }>,
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

  static async deleteAsset(id: string, requesterId: string) {
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

  /**
   * Every asset, for the admin console. Gated on `queue:read` at the route.
   *
   * Pass-through. It exists so controllers reach the data layer through a
   * service, which `tools/validate-architecture.mjs` enforces.
   */
  static async findAllAssetsAdmin(filters?: {
    ownerId?: string;
    category?: string;
    status?: AssetStatus;
  }) {
    return AssetRepo.findAllAssetsAdmin(filters);
  }
}
