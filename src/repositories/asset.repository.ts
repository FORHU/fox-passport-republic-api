import { prisma } from "../utils/prisma";
import { AssetStatus, AssetCategory } from "@prisma/client";

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

    // CREATE
    static async createAsset(data: any) {
        return prisma.asset.create({
            data: {
                ...data,
                status: data.status || AssetStatus.available,
            },
        });
    }
}
