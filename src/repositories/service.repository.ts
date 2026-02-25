import { prisma } from "../utils/prisma";
import { ServiceStatus, ServiceCategory } from "@prisma/client";

export default class ServiceRepo {
    // READ ALL
    static async getAllServices(filters?: {
        ownerId?: number | string;
        category?: ServiceCategory;
        status?: ServiceStatus;
    }) {
        return prisma.service.findMany({
            where: {
                ...(filters?.ownerId && { ownerId: Number(filters.ownerId) }),
                ...(filters?.category && { category: filters.category }),
                ...(filters?.status && { status: filters.status }),
            },
            include: {
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
    static async createService(data: {
        ownerId: number | string;
        name: string;
        description: string;
        category: ServiceCategory;
        price: number;
        status?: ServiceStatus;
    }) {
        return prisma.service.create({
            data: {
                ...data,
                ownerId: Number(data.ownerId),
                status: data.status || ServiceStatus.active,
            },
        });
    }
}
