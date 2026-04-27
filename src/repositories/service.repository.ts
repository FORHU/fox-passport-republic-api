import { prisma } from "../utils/prisma";
import { BillingRate, ServiceStatus } from "@prisma/client";

export default class ServiceRepo {
  static async getAllServices(filters?: {
    ownerId?: string;
    category?: string;
    status?: ServiceStatus;
  }) {
    return prisma.service.findMany({
      where: {
        ...(filters?.ownerId && { ownerId: String(filters.ownerId) }),
        ...(filters?.category && { category: String(filters.category) }),
        ...(filters?.status && { status: filters.status }),
        deletedAt: null,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

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
    tags: string[];
    price: number;
    currency?: string;
    billingRate: BillingRate;
    status?: ServiceStatus;
    imgIds: string[];
  }) {
    return prisma.service.create({
      data: {
        id: data.id,
        ownerId: String(data.ownerId),
        category: String(data.category),
        name: data.name,
        description: data.description,
        city: data.city,
        state: data.state,
        country: data.country,
        isWillingToTravel: data.isWillingToTravel,
        tags: data.tags,
        price: data.price,
        currency: data.currency,
        billingRate: data.billingRate,
        status: data.status,
        ...(data.imgIds && data.imgIds.length > 0 && {
          images: { connect: data.imgIds.map((id) => ({ id })) },
        }),
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
    });
  }

  static async getServiceById(id: string) {
    return prisma.service.findUnique({
      where: { id: String(id) },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
    });
  }

  static async updateService(
    id: string,
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
      imgIds: string[];
    }>
  ) {
    return prisma.service.update({
      where: { id: String(id) },
      data: {
        category: data.category ?? undefined,
        name: data.name ?? undefined,
        description: data.description ?? undefined,
        city: data.city ?? undefined,
        state: data.state ?? undefined,
        country: data.country ?? undefined,
        isWillingToTravel: data.isWillingToTravel ?? undefined,
        tags: data.tags ?? undefined,
        price: data.price ?? undefined,
        currency: data.currency ?? undefined,
        billingRate: data.billingRate ?? undefined,
        status: data.status ?? undefined,
        ...(data.imgIds && data.imgIds.length > 0 && {
          images: { connect: data.imgIds.map((id) => ({ id })) },
        }),
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
    });
  }

  static async deleteService(id: string) {
    return prisma.service.update({
      where: { id: String(id) },
      data: { deletedAt: new Date() },
    });
  }
}
