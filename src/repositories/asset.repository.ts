import { prisma } from "../utils/prisma";
import { AssetStatus, AssetCategory } from "@prisma/client";

export default class AssetRepo {
    // READ ALL
    static async getAllAssets(filters?: {
        investorId?: string;
        category?: AssetCategory;
        status?: AssetStatus;
    }) {
        return prisma.asset.findMany({
            where: {
                ...(filters?.investorId && { investorId: filters.investorId }),
                ...(filters?.category && { category: filters.category }),
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                images: true,
                investor: {
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
