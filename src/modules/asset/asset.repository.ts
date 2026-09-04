import {
  AssetCondition,
  AssetStatus,
  BillingRate,
  AssetCategory,
} from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { toEnum } from "../../utils/enums";

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

    // `Promise.all`, not `$transaction`: a list and its count need no
    // transactional isolation, and demanding one means waiting for a free
    // connection to *start* a transaction — which is what times out under a
    // burst with "Unable to start a transaction in the given time". The count
    // can now shift by one against a concurrent insert; a 500 on a browse page
    // is the worse trade.
    const [assets, total] = await Promise.all([
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

  // Public browse for the search page — item-level pagination (not nested under owner)
  // so a page always holds exactly `limit` items instead of varying with how many
  // items each owner happens to have.
  static async findPublicAssets(filters: {
    ownerCity?: string;
    maxPrice?: number;
    page?: number;
    limit: number;
  }) {
    const page = filters.page ?? 1;
    const limit = filters.limit;
    const skip = (page - 1) * limit;

    const where = {
      status: AssetStatus.available,
      deletedAt: null,
      ...(filters.maxPrice !== undefined && {
        price: { lte: filters.maxPrice },
      }),
      owner: {
        roleType: { has: "gearFoxer" as const },
        ...(filters.ownerCity && {
          city: { contains: filters.ownerCity, mode: "insensitive" as const },
        }),
      },
    };

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        select: {
          id: true,
          name: true,
          category: true,
          price: true,
          billingRate: true,
          images: { take: 1, select: { url: true } },
          owner: { select: { id: true, name: true } },
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
