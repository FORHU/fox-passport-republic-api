import { EventType } from "@prisma/client";
import EventTemplateRepo from "../repositories/event-template.repository";

export default class EventTemplateSvc {
  static async createTemplate(data: {
    ownerId: string;
    name: string;
    description: string;
    category: EventType;
    isPublic?: boolean;
    imgIds?: string[];
  }) {
    return EventTemplateRepo.createTemplate(data);
  }

  static async updateTemplate(params: {
    id: string;
    ownerId: string;
    data: Partial<{
      name: string;
      description: string;
      category: EventType;
      isPublic: boolean;
      imgIds: string[];
    }>;
  }) {
    const { id, ownerId, data } = params;
    await this.verifyOwnership(id, ownerId);
    return EventTemplateRepo.updateTemplate(id, data);
  }

  static async getTemplates(filters?: { ownerId?: string; isPublic?: boolean }) {
    return EventTemplateRepo.findAllTemplates(filters);
  }

  static async getTemplateById(id: string) {
    const template = await EventTemplateRepo.findTemplateById(id);
    if (!template) {
      throw new Error("Event template not found");
    }
    return template;
  }

  static async attachAsset(templateId: string, ownerId: string, assetId: string, quantity?: number) {
    await this.verifyOwnership(templateId, ownerId);
    return EventTemplateRepo.attachAsset(templateId, assetId, quantity);
  }

  static async removeAsset(templateId: string, ownerId: string, assetId: string) {
    await this.verifyOwnership(templateId, ownerId);
    await EventTemplateRepo.removeAsset(templateId, assetId);
    return { message: "Asset removed from template" };
  }

  static async attachService(templateId: string, ownerId: string, serviceId: string) {
    await this.verifyOwnership(templateId, ownerId);
    return EventTemplateRepo.attachService(templateId, serviceId);
  }

  static async removeService(templateId: string, ownerId: string, serviceId: string) {
    await this.verifyOwnership(templateId, ownerId);
    await EventTemplateRepo.removeService(templateId, serviceId);
    return { message: "Service removed from template" };
  }

  static async attachVenue(templateId: string, ownerId: string, venueId: string) {
    await this.verifyOwnership(templateId, ownerId);
    return EventTemplateRepo.attachVenue(templateId, venueId);
  }

  static async removeVenue(templateId: string, ownerId: string, venueId: string) {
    await this.verifyOwnership(templateId, ownerId);
    await EventTemplateRepo.removeVenue(templateId, venueId);
    return { message: "Venue removed from template" };
  }

  static async deleteTemplate(id: string, ownerId: string) {
    await this.verifyOwnership(id, ownerId);
    await EventTemplateRepo.deleteTemplate(id);
    return { message: "Event template deleted successfully" };
  }

  private static async verifyOwnership(templateId: string, ownerId: string) {
    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) {
      throw new Error("Event template not found");
    }
    if (template.ownerId !== ownerId) {
      throw new Error("Unauthorized: You do not own this template");
    }
  }
}
