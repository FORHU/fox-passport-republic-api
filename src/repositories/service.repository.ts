import { prisma } from "../utils/prisma";
import { BillingRate, ServiceStatus, ServiceCategory } from "@prisma/client";

export default class ServiceRepo {
  // READ ALL (public — available only)
  static async getAllServices(filters?: {
    ownerId?: string;
    category?: ServiceCategory;
  }) {
    return prisma.service.findMany({
      where: {
        ...(filters?.ownerId && { ownerId: String(filters.ownerId) }),
        ...(filters?.category && { category: filters.category }),
        ...(filters?.ownerId ? {} : { status: ServiceStatus.available }),
        deletedAt: null,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // READ ALL (admin — no status filter)
  static async getAllServicesAdmin(filters?: {
    ownerId?: string;
    category?: ServiceCategory;
    status?: ServiceStatus;
  }) {
    return prisma.service.findMany({
      where: {
        ...(filters?.ownerId && { ownerId: String(filters.ownerId) }),
        ...(filters?.category && { category: filters.category }),
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
    category: ServiceCategory;
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
        category: data.category,
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
