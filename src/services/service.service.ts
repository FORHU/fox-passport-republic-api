import ServiceRepo from "../repositories/service.repository";
import { BillingRate, ServiceStatus } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

export default class ServiceSvc {
  static async createService(data: {
    id?: string;
    ownerId: string;
    category: string;
    name: string;
    description: string;
    city: string;
    state?: string;
    country: string;
    isWillingToTravel?: boolean;
    tags?: string[];
    price: number;
    currency?: string;
    billingRate?: BillingRate;
    status?: ServiceStatus;
  }) {
    const normalized = {
      ...data,
      id: data.id ?? uuidv4(),
      isWillingToTravel: data.isWillingToTravel ?? false,
      tags: data.tags ?? [],
      currency: data.currency ?? "USD",
      status: data.status ?? ServiceStatus.draft,
      billingRate: data.billingRate ?? BillingRate.daily,
    };

    return ServiceRepo.createService(normalized);
  }

  static async getAllServices(filters?: {
    ownerId?: string;
    category?: string;
    status?: ServiceStatus;
  }) {
    return ServiceRepo.getAllServices(filters);
  }

  static async getServiceById(id: string) {
    const service = await ServiceRepo.getServiceById(id);
    if (!service || service.deletedAt) {
      throw new Error("Service not found");
    }
    return service;
  }

  static async updateService(
    id: string,
    ownerId: string,
    data: Partial<{
      category: string;
      name: string;
      description: string;
      city: string;
      state: string;
      country: string;
      isWillingToTravel: boolean;
      tags: string[];
      price: number;
      currency: string;
      billingRate: BillingRate;
      status: ServiceStatus;
    }>
  ) {
    const existing = await ServiceRepo.getServiceById(id);
    if (!existing || existing.deletedAt) {
      throw new Error("Service not found");
    }
    if (existing.ownerId !== ownerId) {
      throw new Error("Unauthorized");
    }

    return ServiceRepo.updateService(id, data);
  }

  static async deleteService(id: string, requesterId: string) {
    const service = await ServiceRepo.getServiceById(id);
    if (!service || service.deletedAt) {
      throw new Error("Service not found");
    }
    if (service.ownerId !== requesterId) {
      throw new Error("You are not authorized to delete this service");
    }

    await ServiceRepo.deleteService(id);
    return { message: "Service deleted successfully" };
  }
}
