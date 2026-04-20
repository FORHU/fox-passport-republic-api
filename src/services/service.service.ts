import ServiceRepo from "../repositories/service.repository";
import { ServiceStatus } from "@prisma/client";
import { BillingRate } from "@prisma/client";
import { uploadServiceImage } from "../utils/supabase";
import { v4 as uuidv4 } from "uuid";

export default class ServiceSvc {
    static async uploadServiceImages(serviceId: string, ownerId: string, files: Express.Multer.File[]) {
        const images = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const url = await uploadServiceImage(file, serviceId);
            const isThumbnail = i === 0;
            const image = await this.addImage(
                serviceId,
                ownerId,
                url,
                isThumbnail,
                file.originalname,
                i
            );
            images.push(image);
        }

        return images;
    }

    static async getAllServices(filters?: {
        ownerId?: string;
        category?: string;
        status?: ServiceStatus;
    }) {
        return ServiceRepo.getAllServices(filters);
    }

    static async createService(data: any) {
        // Normalize defaults at the service layer (repo only persists).
        const normalized = {
            ...data,
            id: data.id ?? uuidv4(),
            status: data.status ?? ServiceStatus.available,
            billingRate: data.billingRate as BillingRate,
            images: Array.isArray(data.images)
                ? data.images.map((img: any, index: number) => ({
                      url: img.url,
                      altText: img.altText ?? undefined,
                      orderIndex: img.orderIndex ?? index,
                      isThumbnail: img.isThumbnail ?? index === 0,
                  }))
                : undefined,
        };

        return ServiceRepo.createService(normalized);
    }

    static async getServiceById(id: string) {
        return ServiceRepo.getServiceById(id);
    }

    static async updateService(id: string, ownerId: string, data: any) {
        const serviceOwnerId = await ServiceRepo.getServiceOwnerId(id);
        if (!serviceOwnerId) throw new Error("Service not found");
        if (serviceOwnerId !== ownerId) throw new Error("Unauthorized to update this service");

        return ServiceRepo.updateService(id, data);
    }

    static async deleteService(id: string, ownerId: string) {
        const serviceOwnerId = await ServiceRepo.getServiceOwnerId(id);
        if (!serviceOwnerId) throw new Error("Service not found");
        if (serviceOwnerId !== ownerId) throw new Error("Unauthorized to delete this service");

        return ServiceRepo.deleteService(id);
    }

    // IMAGE SERVICE METHODS
    static async addImage(
        serviceId: string,
        ownerId: string,
        url: string,
        isThumbnail: boolean,
        altText?: string,
        orderIndex?: number
    ) {
        const serviceOwnerId = await ServiceRepo.getServiceOwnerId(serviceId);
        if (!serviceOwnerId || serviceOwnerId !== ownerId) {
            throw new Error("Unauthorized: You do not own this service");
        }
        return { serviceId, url, isThumbnail, altText, orderIndex };
    }

    static async updateImage(ownerId: string, imageId: string, data: Partial<any>) {
        void ownerId;
        return { imageId, ...data };
    }

    static async deleteImage(ownerId: string, imageId: string) {
        void ownerId;
        return { deleted: true, imageId };
    }
}
