import { prisma } from "../utils/prisma";
import { ServiceStatus, ServiceCategory } from "@prisma/client";

export default class ServiceRepo {
    // READ ALL
    static async getAllServices(filters?: {
        foxerId?: string;
        category?: ServiceCategory;
        status?: ServiceStatus;
    }) {
        return prisma.service.findMany({
            where: {
                ...(filters?.foxerId && { foxerId: filters.foxerId }),
                ...(filters?.category && { category: filters.category }),
                ...(filters?.status && { status: filters.status }),
            },
            include: {
                foxer: {
                    include: {
                        user: {
                            select: {
                                name: true,
                                id: true
                            }
                        }
                    }
                }
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
