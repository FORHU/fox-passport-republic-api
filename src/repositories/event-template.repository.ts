import { prisma } from "../utils/prisma";
import { EventType } from "@prisma/client";

export default class EventTemplateRepo {
  // CREATE
  static async createTemplate(data: {
    ownerId: string;
    name: string;
    description: string;
    category: EventType;
    isPublic?: boolean;
    imgIds?: string[];
  }) {
    const { imgIds, ...rest } = data;
    return prisma.eventTemplate.create({
      data: {
        ...rest,
        images: imgIds ? { connect: imgIds.map(id => ({ id })) } : undefined,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
    });
  }

  // FIND ALL
  static async findAllTemplates(filters?: { ownerId?: string; isPublic?: boolean }) {
    return prisma.eventTemplate.findMany({
      where: {
        ...(filters?.ownerId && { ownerId: filters.ownerId }),
        ...(filters?.isPublic !== undefined && { isPublic: filters.isPublic }),
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
        images: imgIds ? { set: imgIds.map((id: string) => ({ id })) } : undefined,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        images: true,
      },
    });
  }

  // ASSETS
  static async attachAsset(templateId: string, assetId: string, quantity: number = 1) {
    return prisma.eventTemplateAsset.create({
      data: {
        templateId,
        assetId,
        quantity,
      },
      include: { asset: true },
    });
  }

  static async removeAsset(templateId: string, assetId: string) {
    return prisma.eventTemplateAsset.deleteMany({
      where: { templateId, assetId },
    });
  }

  // SERVICES
  static async attachService(templateId: string, serviceId: string) {
    return prisma.eventTemplateService.create({
      data: {
        templateId,
        serviceId,
      },
      include: { service: true },
    });
  }

  static async removeService(templateId: string, serviceId: string) {
    return prisma.eventTemplateService.deleteMany({
      where: { templateId, serviceId },
    });
  }

  // VENUES
  static async attachVenue(templateId: string, venueId: string) {
    return prisma.eventTemplateVenue.create({
      data: {
        templateId,
        venueId,
      },
      include: { venue: true },
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
