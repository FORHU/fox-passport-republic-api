import { prisma } from "../utils/prisma";

export default class AssetRepo {
    // READ ALL
    static async getAllAssets(filters?: {
        ownerId?: string;
        category?: AssetCategory;
        status?: AssetStatus;
    }) {
        return prisma.asset.findMany({
            where: {
                ...(filters?.ownerId && { ownerId: filters.ownerId }),
                // ...(filters?.category && { category: filters.category }), // FIX: Schema uses relation, not Enum
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                assetImages: true, // FIX: Renamed from 'images' to match schema
                owner: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
    }

  //CREATE Asset Repository
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
    return prisma.asset.create({
      data: {
        ownerId: data.ownerId,
        hostId: data.hostId,
        categoryId: data.categoryId ?? null,
        name: data.name,
        description: data.description,
        condition: data.condition ?? "good",
        propertyType: data.propertyType ?? null,
        roomType: data.roomType ?? null,
        capacity: data.capacity ?? null,
        maxAttendees: data.maxAttendees ?? null,
        assetImages: data.images?.length
          ? {
              create: data.images.map((img, index) => ({
                url: img.url,
                altText: img.altText ?? null,
                orderIndex: img.orderIndex ?? index,
                isThumbnail: img.isThumbnail ?? index === 0,
              })),
            }
          : undefined,
      },
      include: {
        assetImages: true,
        owner: { select: { id: true, name: true, email: true } },
        host: { select: { id: true, name: true, email: true } },
        category: true,
      },
    });
  }

  //READ Asset by ID Repository
    static async findAssetById(id: number) {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Invalid asset id");
    }

    return prisma.asset.findUnique({
      where: { id },
      include: {
        assetImages: true,
        owner: { select: { id: true, name: true, email: true } },
        host: { select: { id: true, name: true, email: true } },
        category: true,
      },
    });
  }

  //READ Assets Repository with optional filters for ownerId and categoryId
    static async findAllAssets(filters?: { ownerId?: number; categoryId?: number }) {
    return prisma.asset.findMany({
      where: {
        ...(filters?.ownerId && { ownerId: filters.ownerId }),
        ...(filters?.categoryId && { categoryId: filters.categoryId }),
      },
      include: {
        assetImages: { where: { isThumbnail: true }, take: 1 },
        owner: { select: { id: true, name: true } },
        category: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  //UPDATE Asset Repository 
  static async updateAsset(
    id: number,
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
    // if images are provided we will replace all existing ones
    const imagesOps = data.images
      ? {
          deleteMany: {},
          create: data.images.map((img, idx) => ({
            url: img.url,
            altText: img.altText ?? null,
            orderIndex: img.orderIndex ?? idx,
            isThumbnail: img.isThumbnail ?? idx === 0,
          })),
        }
      : undefined;

    return prisma.asset.update({
      where: { id },
      data: {
        hostId: data.hostId ?? undefined,
        categoryId: Object.prototype.hasOwnProperty.call(data, "categoryId")
          ? data.categoryId === null
            ? null
            : data.categoryId
          : undefined,
        name: data.name ?? undefined,
        description: data.description ?? undefined,
        condition: data.condition ?? undefined,
        propertyType: data.propertyType ?? undefined,
        roomType: data.roomType ?? undefined,
        capacity: data.capacity ?? undefined,
        maxAttendees: data.maxAttendees ?? undefined,
        ...(imagesOps && { assetImages: imagesOps }),
      },
      include: {
        assetImages: true,
        owner: { select: { id: true, name: true, email: true } },
        host: { select: { id: true, name: true, email: true } },
        category: true,
      },
    });
  }

  //DELETE Asset Repository
  static async deleteAsset(id: number) {
    return prisma.asset.update({
      where: { id },
      data: { deleteAt: new Date() }
    });
  }
}