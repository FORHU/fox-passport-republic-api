import { AssetCondition, BillingRate } from "@prisma/client";
import { prisma } from "../utils/prisma";

export default class AssetRepo {
    // READ ALL
    static async findAllAssets(filters?: { ownerId?: string; categoryId?: string }) {
        return prisma.asset.findMany({
            where: {
                ...(filters?.ownerId && { ownerId: filters.ownerId }),
                ...(filters?.categoryId && { categoryId: filters.categoryId }),
                deleteAt: null, // Only return non-deleted assets
            },
            include: {
                assetImages: true,
                owner: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                host: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                category: true,
            },
            orderBy: { createdAt: "desc" },
        });
    }

    // CREATE
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
        billingRate: BillingRate;
        images?: { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean }[];
    }) {
        return prisma.asset.create({
            data: {
                id: data.id,
                ownerId: data.ownerId,
                hostId: data.hostId,
                categoryId: data.categoryId ?? null,
                name: data.name,
                description: data.description,
                ...(data.condition ? { condition: data.condition } : {}),
                billingRate: data.billingRate,
                propertyType: data.propertyType ?? null,
                roomType: data.roomType ?? null,
                capacity: data.capacity ?? null,
                maxAttendees: data.maxAttendees ?? null,
                price: data.price,
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

    // READ BY ID
    static async findAssetById(id: string) {
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

    // UPDATE
    static async updateAsset(
        id: string,
        data: Partial<{
            hostId: string;
            categoryId?: string | null;
            name: string;
            description: string;
            condition?: AssetCondition;
            billingRate?: BillingRate;
            propertyType?: string;
            roomType?: string;
            capacity?: number;
            maxAttendees?: number;
            price: number;
            images?: { url: string; altText?: string; orderIndex?: number; isThumbnail?: boolean }[];
        }>
    ) {
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
                billingRate: data.billingRate ?? undefined,
                propertyType: data.propertyType ?? undefined,
                roomType: data.roomType ?? undefined,
                capacity: data.capacity ?? undefined,
                price: data.price !== undefined ? data.price : undefined,
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

    // DELETE (Soft delete)
    static async deleteAsset(id: string) {
        return prisma.asset.update({
            where: { id },
            data: { deleteAt: new Date() }
        });
    }

    // IMAGE MANAGEMENT
    static async addImage(assetId: string, url: string, isThumbnail: boolean, altText?: string, orderIndex?: number) {
        return prisma.assetImage.create({
            data: {
                assetId,
                url,
                isThumbnail,
                altText: altText || null,
                orderIndex: orderIndex || 0,
            },
        });
    }

    static async updateImage(imageId: string, data: any) {
        return prisma.assetImage.update({
            where: { id: imageId },
            data,
        });
    }

    static async findImageById(imageId: string) {
        return prisma.assetImage.findUnique({
            where: { id: imageId },
            include: { asset: true },
        });
    }

    static async deleteImage(imageId: string) {
        return prisma.assetImage.delete({
            where: { id: imageId },
        });
    }
}
