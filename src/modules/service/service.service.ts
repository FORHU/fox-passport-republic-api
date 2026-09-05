import ServiceRepo from "./service.repository";
import { BillingRate, ServiceStatus, ServiceCategory } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

export default class ServiceSvc {
  static async createService(data: {
    id?: string;
    ownerId: string;
    category: ServiceCategory;
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
    imgIds: string[];
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

    if (!Array.isArray(data.imgIds) || data.imgIds.length === 0) {
      throw new Error("At least one image is required");
    }
    if (data.imgIds.length > 5) {
      throw new Error("A maximum of 5 images is allowed");
    }

    const serviceData = {
      ...normalized,
      imgIds: data.imgIds,
    };

    return ServiceRepo.createService(serviceData);
  }

  static async getAllServices(filters?: {
    ownerId?: string;
    category?: ServiceCategory;
    status?: ServiceStatus;
    city?: string;
    page?: number;
    limit?: number;
  }) {
    const { services, total } = await ServiceRepo.getAllServices(filters);
    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const sorted = await PassportSvc.sortByFeaturedPerk(
      services,
      "service_featured",
      "ownerId",
    );
    const enriched = await PassportSvc.enrichWithOwnerBadge(
      sorted,
      "service_verified",
      "ownerId",
    );
    return { services: enriched, total };
  }

  static async browseServices(filters: {
    ownerCity?: string;
    maxPrice?: number;
    page?: number;
    limit: number;
  }) {
    return ServiceRepo.findPublicServices(filters);
  }

  static async getServiceById(id: string) {
    const service = await ServiceRepo.getServiceById(id);
    if (!service || service.deletedAt) throw new Error("Service not found");
    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const [enriched] = await PassportSvc.enrichWithOwnerBadge(
      [service],
      "service_verified",
      "ownerId",
    );
    return enriched;
  }

  static async updateService(
    id: string,
    ownerId: string,
    data: Partial<{
      category: ServiceCategory;
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
      imgIds?: string[];
    }>,
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

  /**
   * Every service listing, for the admin console. Gated on `queue:read`.
   *
   * Pass-through. It exists so controllers reach the data layer through a
   * service, which `tools/validate-architecture.mjs` enforces.
   */
  static async getAllServicesAdmin(filters?: {
    ownerId?: string;
    category?: ServiceCategory;
    status?: ServiceStatus;
  }) {
    return ServiceRepo.getAllServicesAdmin(filters);
  }
}
