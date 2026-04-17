import { AssetCondition, AssetStatus, BillingRate } from "@prisma/client";
import { prisma } from "../utils/prisma";

export default class AssetRepo {
  // READ ALL
  static async findAllAssets(filters?: { ownerId?: string; category?: string }) {
    return prisma.asset.findMany({
      where: {
        ...(filters?.ownerId && { ownerId: String(filters.ownerId) }),
        ...(filters?.category && { category: String(filters.category) }),
        deletedAt: null,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        files: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // CREATE
  static async createAsset(data: {
    id?: string;
    ownerId: string;
    category: string;
    name: string;
    description: string;
    price: number;
    billingRate: BillingRate;
    condition?: AssetCondition;
    status?: AssetStatus;
    imgId?: string | null;
  }) {
    return prisma.asset.create({
      data: {
        id: data.id,
        ownerId: String(data.ownerId),
        category: String(data.category),
        name: data.name,
        description: data.description,
        price: data.price,
        billingRate: data.billingRate,
        condition: data.condition,
        status: data.status,
        imgId: data.imgId ?? undefined,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        files: true,
      },
    });
  }

  // READ BY ID
  static async findAssetById(id: string) {
    return prisma.asset.findUnique({
      where: { id: String(id) },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        files: true,
      },
    });
  }

  // UPDATE
  static async updateAsset(
    id: string,
    data: Partial<{
      category: string;
      name: string;
      description: string;
      price: number;
      billingRate: BillingRate;
      condition: AssetCondition;
      status: AssetStatus;
      imgId: string | null;
    }>
  ) {
    return prisma.asset.update({
      where: { id: String(id) },
      data: {
        category: data.category ?? undefined,
        name: data.name ?? undefined,
        description: data.description ?? undefined,
        price: data.price ?? undefined,
        billingRate: data.billingRate ?? undefined,
        condition: data.condition ?? undefined,
        status: data.status ?? undefined,
        imgId: Object.prototype.hasOwnProperty.call(data, "imgId") ? (data.imgId as any) : undefined,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        files: true,
      },
    });
  }

  // DELETE (Soft delete)
  static async deleteAsset(id: string) {
    return prisma.asset.update({
      where: { id: String(id) },
      data: { deletedAt: new Date() },
    });
  }

  // IMAGE-LIKE HELPERS BACKED BY `File` MODEL
  static async addImage(assetId: string, url: string, isThumbnail: boolean, altText?: string, orderIndex?: number) {
    return prisma.file.create({
      data: {
        assetId: String(assetId),
        url,
        name: altText ?? `asset-image-${orderIndex ?? 0}`,
        type: isThumbnail ? "thumbnail" : "image",
      },
    });
  }

  static async findImageById(imageId: string) {
    return prisma.file.findUnique({
      where: { id: String(imageId) },
      include: { asset: true },
    });
  }

  static async updateImage(imageId: string, data: Partial<{ url: string; altText: string | null; isThumbnail: boolean }>) {
    return prisma.file.update({
      where: { id: String(imageId) },
      data: {
        ...(data.url ? { url: data.url } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "altText")
          ? { name: data.altText ?? "image" }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(data, "isThumbnail")
          ? { type: data.isThumbnail ? "thumbnail" : "image" }
          : {}),
      },
    });
  }

  static async deleteImage(imageId: string) {
    return prisma.file.delete({
      where: { id: String(imageId) },
    });
  }
}
