import { prisma } from "../utils/prisma";
import { ServiceStatus, ServiceCategory } from "@prisma/client";

export default class ServiceRepo {
    // READ ALL
    static async getAllServices(filters?: {
        ownerId?: string;
        category?: ServiceCategory;
        status?: ServiceStatus;
    }) {
        return prisma.service.findMany({
            where: {
                ...(filters?.ownerId && { ownerId: String(filters.ownerId) }),
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
        ownerId: string;
        name: string;
        description: string;
        category: ServiceCategory;
        price: number;
        status?: ServiceStatus;
    }) {
        return prisma.service.create({
            data: {
                ...data,
                ownerId: String(data.ownerId),
                status: data.status || ServiceStatus.active,
            },
        });
    }
}
