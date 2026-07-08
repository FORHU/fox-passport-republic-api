import {
  AssetCondition,
  BillingRate,
  AssetCategory,
  AssetStatus,
} from "@prisma/client";
import AssetRepo from "../repositories/asset.repository";
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

    const asset = await AssetRepo.createAsset(assetData as any);
    return asset;
  }

  static async getAssets(filters?: {
    ownerId?: string;
    category?: AssetCategory;
  }) {
    return AssetRepo.findAllAssets(filters);
  }

  static async getAssetById(id: string) {
    const asset = await AssetRepo.findAssetById(id);
    if (!asset) {
      throw new Error("Asset not found");
    }
    return asset;
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
}
