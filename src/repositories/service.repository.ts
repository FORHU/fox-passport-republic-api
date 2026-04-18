import { prisma } from "../utils/prisma";
import { ServiceStatus, BillingRate } from "@prisma/client";

export default class ServiceRepo {
    // READ ALL
    static async getAllServices(filters?: {
        ownerId?: string;
        category?: string;
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
            orderBy: {
                createdAt: "desc",
            },
        });
    }

    // CREATE
    static async createService(data: {
        id?: string;
        ownerId: string;
        name: string;
        description: string;
        category: string;
        price: number;
        status?: ServiceStatus;
        billingRate: BillingRate;
        imgId?: string;
    }) {
        // Repo should only persist; business defaults are expected to be normalized by the service.
        return prisma.service.create({
            data: {
                id: data.id,
                ownerId: String(data.ownerId),
                name: data.name,
                description: data.description,
                category: data.category,
                price: data.price,
                status: data.status,
                billingRate: data.billingRate,
                imgId: data.imgId ?? undefined,
            },
            include: {
                owner: { select: { id: true, name: true, email: true } },
            },
        });
    }

    // READ BY ID
    static async getServiceById(id: string) {
        return prisma.service.findUnique({
            where: { id },
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

    // UPDATE
    static async updateService(id: string, data: any) {
        return prisma.service.update({
            where: { id },
            data,
            include: {
                owner: { select: { id: true, name: true, email: true } },
            },
        });
    }

    // DELETE
    static async deleteService(id: string) {
        return prisma.service.delete({
            where: { id },
        });
    }

    // CHECK OWNERSHIP (query only; authorization lives in service)
    static async getServiceOwnerId(serviceId: string) {
        const service = await prisma.service.findUnique({
            where: { id: serviceId },
            select: { ownerId: true },
        });
        return service?.ownerId ?? null;
    }

}
