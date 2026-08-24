import {
  AssetCondition,
  AssetStatus,
  BillingRate,
  AssetCategory,
} from "@prisma/client";
import { prisma } from "../utils/prisma";
import { toEnum } from "../utils/enums";

export default class AssetRepo {
  // READ ALL (public — available only)
  static async findAllAssets(filters?: {
    ownerId?: string;
    category?: string;
    city?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 50;
    const skip = (page - 1) * limit;
    const category = toEnum(AssetCategory, filters?.category);

    const where = {
      ...(filters?.ownerId && { ownerId: String(filters.ownerId) }),
      ...(category && { category }),
      ...(filters?.city && {
        city: { contains: filters.city, mode: "insensitive" as const },
      }),
      ...(filters?.ownerId ? {} : { status: AssetStatus.available }),
      deletedAt: null,
    };

    const [assets, total] = await prisma.$transaction([
      prisma.asset.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          images: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.asset.count({ where }),
    ]);

    return { assets, total };
  }

  // READ ALL (admin — no status filter)
  static async findAllAssetsAdmin(filters?: {
    ownerId?: string;
    category?: string;
    status?: AssetStatus;
  }) {
    const category = toEnum(AssetCategory, filters?.category);
    return prisma.asset.findMany({
      where: {
        ...(filters?.ownerId && { ownerId: String(filters.ownerId) }),
        ...(category && { category }),
        ...(filters?.status && { status: filters.status }),
        deletedAt: null,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // CREATE
  static async createAsset(data: {
    id?: string;
    ownerId: string;
    category: AssetCategory;
    name: string;
    description: string;
    quantity?: number;
    price: number;
    currency?: string;
    billingRate: BillingRate;
    condition?: AssetCondition;
    status?: AssetStatus;
    imgIds: string[];
  }) {
    return prisma.asset.create({
      data: {
        id: data.id,
        ownerId: String(data.ownerId),
        category: data.category,
        name: data.name,
        description: data.description,
        quantity: data.quantity,
        price: data.price,
        currency: data.currency,
        billingRate: data.billingRate,
        condition: data.condition,
        status: data.status,
        ...(data.imgIds &&
          data.imgIds.length > 0 && {
            images: { connect: data.imgIds.map((id) => ({ id })) },
          }),
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
    });
  }

  // READ BY ID
  static async findAssetById(id: string) {
    return prisma.asset.findUnique({
      where: { id: String(id) },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
    });
  }

  // UPDATE
  static async updateAsset(
    id: string,
    data: Partial<{
      category: AssetCategory;
      name: string;
      description: string;
      quantity: number;
      price: number;
      currency: string;
      billingRate: BillingRate;
      condition: AssetCondition;
      status: AssetStatus;
      imgIds: string[];
    }>,
  ) {
    return prisma.asset.update({
      where: { id: String(id) },
      data: {
        category: data.category ?? undefined,
        name: data.name ?? undefined,
        description: data.description ?? undefined,
        quantity: data.quantity ?? undefined,
        price: data.price ?? undefined,
        currency: data.currency ?? undefined,
        billingRate: data.billingRate ?? undefined,
        condition: data.condition ?? undefined,
        status: data.status ?? undefined,
        ...(data.imgIds &&
          data.imgIds.length > 0 && {
            images: { connect: data.imgIds.map((id) => ({ id })) },
          }),
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
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
}
