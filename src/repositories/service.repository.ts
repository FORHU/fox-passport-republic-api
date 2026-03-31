import { prisma } from "../utils/prisma";
import { ServiceStatus, ServiceCategory, BillingRate } from "@prisma/client";

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
                images: { where: { isThumbnail: true }, take: 1 },
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
        category: ServiceCategory;
        price: number;
        status?: ServiceStatus;
        billingRate: BillingRate;
        images?: {
            url: string;
            altText?: string;
            orderIndex?: number;
            isThumbnail?: boolean;
        }[];
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
                images: data.images?.length
                    ? {
                        create: data.images.map((img, index) => ({
                            url: img.url,
                            altText: img.altText ?? null,
                            orderIndex: img.orderIndex,
                            isThumbnail: img.isThumbnail,
                        })),
                    }
                    : undefined,
            },
            include: {
                images: true,
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
                images: true,
            },
        });
    }

    // UPDATE
    static async updateService(id: string, data: any) {
        return prisma.service.update({
            where: { id },
            data,
            include: {
                images: true,
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

    // IMAGE REPOSITORY METHODS
    static async addServiceImage(data: {
        serviceId: string;
        url: string;
        isThumbnail?: boolean;
        altText?: string;
        orderIndex?: number;
    }) {
        return prisma.serviceImage.create({
            data: {
                serviceId: data.serviceId,
                url: data.url,
                isThumbnail: data.isThumbnail ?? false,
                altText: data.altText ?? null,
                orderIndex: data.orderIndex ?? 0,
            },
        });
    }

    static async updateServiceImage(imageId: string, data: Partial<{
        url: string;
        altText: string | null;
        orderIndex: number;
        isThumbnail: boolean;
    }>) {
        return prisma.serviceImage.update({
            where: { id: imageId },
            data,
        });
    }

    static async deleteServiceImage(imageId: string) {
        return prisma.serviceImage.delete({
            where: { id: imageId },
        });
    }

    static async findImageById(imageId: string) {
        return prisma.serviceImage.findUnique({
            where: { id: imageId },
            include: { service: { select: { ownerId: true } } },
        });
    }
}
