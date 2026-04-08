import { AssetCondition, BillingRate } from "@prisma/client";
import AssetRepo from "../repositories/asset.repository";
import CategorySvc from "./category.service";
import { uploadAssetImage } from "../utils/supabase";
import { v4 as uuidv4 } from "uuid";

type AssetImageInput = { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean };

type CreateAssetFromRequestInput = {
  ownerId: string;
  body: {
    name: string;
    description: string;
    hostId?: string;
    categoryId?: string | null;
    categorySlug?: string;
    condition?: AssetCondition;
    propertyType?: string;
    roomType?: string;
    capacity?: number;
    maxAttendees?: number;
    price: number;
    billingRate?: BillingRate;
    images?: AssetImageInput[];
  };
  files?: Express.Multer.File[];
};

type UpdateAssetFromRequestInput = {
  id: string;
  ownerId: string;
  body: {
    hostId?: string;
    categoryId?: string | null;
    categorySlug?: string;
    name?: string;
    description?: string;
    capacity?: number;
    maxAttendees?: number;
    price?: number;
    billingRate?: BillingRate;
    condition?: AssetCondition;
    propertyType?: string;
    roomType?: string;
    images?: AssetImageInput[];
  };
};

export default class AssetSvc {
  static async createAssetFromRequest(params: CreateAssetFromRequestInput) {
    const assetId = uuidv4();
    const { ownerId, body, files } = params;

    const hostId = body.hostId ?? ownerId;

    // Resolve slug -> id when categoryId isn't provided.
    let categoryId: string | null | undefined = body.categoryId ?? undefined;
    if (body.categorySlug && !categoryId) {
      try {
        const cat = await CategorySvc.getCategoryBySlug(body.categorySlug);
        categoryId = cat.id;
      } catch {
        throw new Error(`Category with slug "${body.categorySlug}" not found`);
      }
    }

    // Preserve existing behavior: category is required to create an asset.
    if (categoryId === undefined || categoryId === null) {
      throw new Error("Category is required");
    }

    const images =
      files && files.length > 0
        ? await Promise.all(
            files.map(async (file, i) => {
              const url = await uploadAssetImage(file, assetId);
              return {
                url,
                altText: file.originalname,
                orderIndex: i,
                isThumbnail: i === 0,
              };
            })
          )
        : body.images;

    return AssetSvc.createAsset({
      id: assetId,
      ownerId,
      hostId,
      categoryId: String(categoryId),
      name: body.name,
      description: body.description,
      condition: body.condition,
      propertyType: body.propertyType,
      roomType: body.roomType,
      capacity: body.capacity,
      maxAttendees: body.maxAttendees,
      price: body.price,
      billingRate: body.billingRate,
      images,
    });
  }

  static async updateAssetFromRequest(params: UpdateAssetFromRequestInput) {
    const { id, ownerId, body } = params;

    const updateData: any = { ...body };

    // Preserve existing behavior:
    // - If categoryId is undefined/null but categorySlug exists, attempt resolution.
    // - If resolution fails, set categoryId to null.
    if ((updateData.categoryId === undefined || updateData.categoryId === null) && updateData.categorySlug) {
      try {
        const cat = await CategorySvc.getCategoryBySlug(updateData.categorySlug);
        updateData.categoryId = cat.id;
      } catch {
        updateData.categoryId = null;
      }
    }

    if (updateData.categoryId !== undefined && updateData.categoryId !== null) {
      updateData.categoryId = String(updateData.categoryId);
    }

    return AssetSvc.updateAsset(id, ownerId, updateData);
  }

  static async uploadAssetImages(assetId: string, ownerId: string, files: Express.Multer.File[]) {
    const images = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = await uploadAssetImage(file, assetId);
      const isThumbnail = i === 0;

      const image = await AssetSvc.addImage(
        assetId,
        ownerId,
        url,
        isThumbnail,
        file.originalname,
        i
      );

      images.push(image);
    }

    return images;
  }

  static async createAsset(data: {
    id?: string;
    ownerId: string;
    hostId: string;
    categoryId?: string;
    name: string;
    description: string;
    condition?: AssetCondition;
    propertyType?: string;
    roomType?: string;
    capacity?: number;
    maxAttendees?: number;
    price: number;
    billingRate?: BillingRate;
    images?: { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean }[];
  }) {
    const normalized = {
      ...data,
      condition: data.condition ?? AssetCondition.good,
      billingRate: data.billingRate ?? BillingRate.daily,
      images: Array.isArray(data.images)
        ? data.images.map((img, index) => ({
            url: img.url,
            altText: img.altText ?? undefined,
            orderIndex: img.orderIndex ?? index,
            isThumbnail: img.isThumbnail ?? index === 0,
          }))
        : undefined,
    };

    const asset = await AssetRepo.createAsset(normalized as any);
    return asset;
  }

  static async getAssets(filters?: { ownerId?: string; categoryId?: string }) {
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
      hostId: string;
      categoryId?: string | null;
      name: string;
      description: string;
      condition?: AssetCondition;
      propertyType?: string;
      roomType?: string;
      capacity?: number;
      maxAttendees?: number;
      price?: number; // Optional in update
      billingRate?: BillingRate;
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

  // IMAGE MANAGEMENT
  static async addImage(assetId: string, ownerId: string, url: string, isThumbnail: boolean, altText?: string, orderIndex?: number) {
    const asset = await AssetRepo.findAssetById(assetId);
    if (!asset) throw new Error("Asset not found");
    if (asset.ownerId !== ownerId) throw new Error("Unauthorized");

    return AssetRepo.addImage(assetId, url, isThumbnail, altText, orderIndex);
  }

  static async updateImage(ownerId: string, imageId: string, data: any) {
    const image = await AssetRepo.findImageById(imageId);
    if (!image) throw new Error("Image not found");
    if (image.asset.ownerId !== ownerId) throw new Error("Unauthorized");

    return AssetRepo.updateImage(imageId, data);
  }

  static async deleteImage(ownerId: string, imageId: string) {
    const image = await AssetRepo.findImageById(imageId);
    if (!image) throw new Error("Image not found");
    if (image.asset.ownerId !== ownerId) throw new Error("Unauthorized");

    return AssetRepo.deleteImage(imageId);
  }
}
