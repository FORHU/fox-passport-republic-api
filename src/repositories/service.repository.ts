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
                ...(filters?.ownerId && { ownerId: filters.ownerId }),
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
    static async createService(data: any) {
        return prisma.service.create({
            data: {
                ...data,
                status: data.status || ServiceStatus.active,
            },
        });
    }
}
