import { prisma } from "../utils/prisma";
import {
  EventCategory,
  AssetCategory,
  ServiceCategory,
  VenueCategory,
  AssetStatus,
  ServiceStatus,
  VenueStatus,
} from "@prisma/client";

export default class EventTemplateRepo {
  // CREATE
  static async createTemplate(data: {
    ownerId: string;
    name: string;
    description: string;
    category: EventCategory;
    isPublic?: boolean;
    imgIds?: string[];
    maxAttendees?: number;
  }) {
    const { imgIds, ...rest } = data;
    return prisma.eventTemplate.create({
      data: {
        ...rest,
        images: imgIds ? { connect: imgIds.map((id) => ({ id })) } : undefined,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
    });
  }

  // FIND ALL
  static async findAllTemplates(filters?: {
    ownerId?: string;
    isPublic?: boolean;
    category?: string;
    city?: string;
    targetCity?: string;
  }) {
    return prisma.eventTemplate.findMany({
      where: {
        ...(filters?.ownerId && { ownerId: filters.ownerId }),
        ...(filters?.isPublic !== undefined && { isPublic: filters.isPublic }),
        ...(filters?.category && { category: filters.category as any }),
        ...((filters?.city || filters?.targetCity) && {
          targetCity: {
            contains: (filters.city ?? filters.targetCity) as string,
            mode: "insensitive",
          },
        }),
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        templateAssets: { include: { asset: true } },
        templateServices: { include: { service: true } },
        templateVenues: { include: { venue: true } },
        images: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Public browse for the search page — supports category / targetCity / isPublic.
  // maxPrice is applied post-query in the service (needs server-computed totalAmount).
  static async findPublicTemplatesLite(filters: {
    category?: string;
    targetCity?: string;
    city?: string;
    isPublic?: boolean;
    maxPrice?: number;
    page?: number;
    limit: number;
  }) {
    const page = filters.page ?? 1;
    const skip = (page - 1) * filters.limit;

    const where = {
      ...(filters.isPublic !== undefined
        ? { isPublic: filters.isPublic }
        : { isPublic: true }),
      ...(filters.category && { category: filters.category as any }),
      ...((filters.targetCity || filters.city) && {
        targetCity: {
          contains: (filters.targetCity ?? filters.city) as string,
          mode: "insensitive" as const,
        },
      }),
    };

    const [templates, total] = await Promise.all([
      prisma.eventTemplate.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          templateAssets: { include: { asset: true } },
          templateServices: { include: { service: true } },
          templateVenues: { include: { venue: true } },
          images: true,
        },
        take: filters.limit,
        skip,
        orderBy: { createdAt: "desc" },
      }),
      prisma.eventTemplate.count({ where }),
    ]);

    return { templates, total };
  }

  // FIND BY ID
  static async findTemplateById(id: string) {
    return prisma.eventTemplate.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        templateAssets: { include: { asset: true } },
        templateServices: { include: { service: true } },
        templateVenues: { include: { venue: true } },
        images: true,
      },
    });
  }

  // UPDATE
  static async updateTemplate(id: string, data: any) {
    const { imgIds, ...rest } = data;
    return prisma.eventTemplate.update({
      where: { id },
      data: {
        ...rest,
        images: imgIds
          ? { set: imgIds.map((id: string) => ({ id })) }
          : undefined,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        // NOTE: must match createTemplate/findTemplateById's include — without these,
        // calculateTotalsBreakdown() has no template items to sum and silently
        // returns 0 for itemsTotal/hostMarkupAmount/platformFeeAmount/totalAmount
        // after every update (pre-existing bug, surfaced while testing hostMarkupPercent).
        templateAssets: { include: { asset: true } },
        templateServices: { include: { service: true } },
        templateVenues: { include: { venue: true } },
        images: true,
      },
    });
  }

  // SUBMIT FOR REVIEW
  static async submitTemplate(id: string, ownerId: string) {
    const template = await prisma.eventTemplate.findUnique({ where: { id } });
    if (!template) throw new Error("Template not found");
    if (template.ownerId !== ownerId) throw new Error("Unauthorized");
    if (template.status !== "draft")
      throw new Error(
        "Template is not in draft — already submitted or published",
      );
    return prisma.eventTemplate.update({
      where: { id },
      data: { status: "pending" },
      select: {
        id: true,
        name: true,
        status: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ASSETS
  static async attachAsset(
    templateId: string,
    assetId?: string,
    quantity: number = 1,
    matchData?: any,
    description?: string,
    matchedAt?: Date,
    agreedPrice?: number,
    isOptional?: boolean,
  ) {
    return prisma.eventTemplateAsset.create({
      data: {
        templateId,
        assetId,
        quantity,
        description,
        matchedAt,
        agreedPrice: agreedPrice ?? 0,
        isOptional: isOptional ?? false,
        ...(matchData || {}),
      },
      include: { asset: true },
    });
  }

  static async updateAssetMatch(id: string, data: any) {
    return prisma.eventTemplateAsset.update({
      where: { id },
      data,
      include: { asset: true },
    });
  }

  static async searchAssetsByLocation(filters: {
    state?: string;
    country?: string;
    category?: string;
  }) {
    return prisma.asset.findMany({
      where: {
        ...(filters.state && { state: filters.state }),
        ...(filters.country && { country: filters.country }),
        ...(filters.category && {
          category: filters.category as AssetCategory,
        }),
        status: AssetStatus.available,
        deletedAt: null,
      },
      include: { owner: { select: { id: true, name: true } }, images: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async removeAsset(templateId: string, assetId: string) {
    return prisma.eventTemplateAsset.deleteMany({
      where: { templateId, assetId },
    });
  }

  // SERVICES
  static async attachService(
    templateId: string,
    serviceId?: string,
    matchData?: any,
    description?: string,
    matchedAt?: Date,
    agreedPrice?: number,
    isOptional?: boolean,
  ) {
    return prisma.eventTemplateService.create({
      data: {
        templateId,
        serviceId,
        description,
        matchedAt,
        agreedPrice: agreedPrice ?? 0,
        isOptional: isOptional ?? false,
        ...(matchData || {}),
      },
      include: { service: true },
    });
  }

  static async updateServiceMatch(id: string, data: any) {
    return prisma.eventTemplateService.update({
      where: { id },
      data,
      include: { service: true },
    });
  }

  static async searchServicesByLocation(filters: {
    state?: string;
    country?: string;
    category?: string;
  }) {
    return prisma.service.findMany({
      where: {
        ...(filters.state && { state: filters.state }),
        ...(filters.country && { country: filters.country }),
        ...(filters.category && {
          category: filters.category as ServiceCategory,
        }),
        status: ServiceStatus.available,
        deletedAt: null,
      },
      include: { owner: { select: { id: true, name: true } }, images: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async removeService(templateId: string, serviceId: string) {
    return prisma.eventTemplateService.deleteMany({
      where: { templateId, serviceId },
    });
  }

  // VENUES
  static async attachVenue(
    templateId: string,
    venueId?: string,
    matchData?: any,
    description?: string,
    matchedAt?: Date,
    agreedPrice?: number,
    isOptional?: boolean,
  ) {
    return prisma.eventTemplateVenue.create({
      data: {
        templateId,
        venueId,
        description,
        matchedAt,
        agreedPrice: agreedPrice ?? 0,
        isOptional: isOptional ?? false,
        ...(matchData || {}),
      },
      include: { venue: true },
    });
  }

  static async updateVenueMatch(id: string, data: any) {
    return prisma.eventTemplateVenue.update({
      where: { id },
      data,
      include: { venue: true },
    });
  }

  static async searchVenuesByLocation(filters: {
    state?: string;
    country?: string;
    category?: string;
  }) {
    return prisma.venue.findMany({
      where: {
        ...(filters.state && { state: filters.state }),
        ...(filters.country && { country: filters.country }),
        ...(filters.category && {
          category: filters.category as VenueCategory,
        }),
        status: VenueStatus.available,
      },
      include: { mayor: { select: { id: true, name: true } }, images: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async removeVenue(templateId: string, venueId: string) {
    return prisma.eventTemplateVenue.deleteMany({
      where: { templateId, venueId },
    });
  }

  // DELETE TEMPLATE
  static async deleteTemplate(id: string) {
    return prisma.eventTemplate.delete({
      where: { id },
    });
  }
}
