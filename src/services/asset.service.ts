import { AssetCondition, BillingRate } from "@prisma/client";
import AssetRepo from "../repositories/asset.repository";
import { v4 as uuidv4 } from "uuid";

export default class AssetSvc {
  static async createAsset(data: {
    id?: string;
    ownerId: string;
    category: string;
    name: string;
    description: string;
    quantity?: number;
    condition?: AssetCondition;
    price: number;
    currency?: string;
    billingRate?: BillingRate;
    status?: "draft" | "pending" | "available" | "reserved" | "archived" | "rejected";
  }) {
    const normalized = {
      ...data,
      id: data.id ?? uuidv4(),
      quantity: data.quantity ?? 1,
      condition: data.condition ?? AssetCondition.good,
      currency: data.currency ?? "USD",
      billingRate: data.billingRate ?? BillingRate.daily,
    };

    const asset = await AssetRepo.createAsset(normalized);
    return asset;
  }

  static async getAssets(filters?: { ownerId?: string; category?: string }) {
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
      category: string;
      name: string;
      description: string;
      quantity: number;
      condition?: AssetCondition;
      price?: number;
      currency?: string;
      billingRate?: BillingRate;
      status?: "draft" | "pending" | "available" | "reserved" | "archived" | "rejected";
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
