import { prisma } from "../utils/prisma";
import { AssetStatus, AssetCategory } from "@prisma/client";

export default class AssetRepo {
    // READ ALL
    static async getAllAssets(filters?: {
        ownerId?: string;
        categoryId?: string;
    }) {
        return prisma.asset.findMany({
            where: {
                ...(filters?.ownerId && { ownerId: filters.ownerId }),
                ...(filters?.categoryId && { categoryId: filters.categoryId }),
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
            },
        });
    }

    // CREATE
    static async createAsset(data: any) {
        return prisma.asset.create({
            data: {
                ...data,
            },
        });
    }
}
