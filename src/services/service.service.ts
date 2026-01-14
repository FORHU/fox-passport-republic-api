import ServiceRepo from "../repositories/service.repository";
import { ServiceStatus, ServiceCategory } from "@prisma/client";

export default class ServiceSvc {
    static async getAllServices(filters?: {
        foxerId?: string;
        category?: ServiceCategory;
        status?: ServiceStatus;
    }) {
        return ServiceRepo.getAllServices(filters);
    }

    static async createService(data: any) {
        return ServiceRepo.createService(data);
    }
}
