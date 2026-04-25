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
    const template = await EventTemplateRepo.createTemplate(data);
    return {
      ...template,
      estimatedTotal: this.calculateTotalAmount(template)
    };
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
    const template = await EventTemplateRepo.updateTemplate(id, data);
    return {
      ...template,
      estimatedTotal: this.calculateTotalAmount(template)
    };
  }

  static async getTemplates(filters?: { ownerId?: string; isPublic?: boolean }) {
    const templates = await EventTemplateRepo.findAllTemplates(filters);
    return templates.map(t => ({
      ...t,
      estimatedTotal: this.calculateTotalAmount(t)
    }));
  }

  static async getTemplateById(id: string) {
    const template = await EventTemplateRepo.findTemplateById(id);
    if (!template) {
      throw new Error("Event template not found");
    }
    return {
      ...template,
      estimatedTotal: this.calculateTotalAmount(template)
    };
  }

  /**
   * Calculate the total price of all items in the template
   */
  static calculateTotalAmount(template: any): number {
    let total = 0;

    // Sum Assets
    if (template.templateAssets) {
      template.templateAssets.forEach((ta: any) => {
        const price = ta.asset?.price || 0;
        const qty = ta.quantity || 1;
        total += price * qty;
      });
    }

    // Sum Services
    if (template.templateServices) {
      template.templateServices.forEach((ts: any) => {
        total += ts.service?.price || 0;
      });
    }

    // Sum Venues
    if (template.templateVenues) {
      template.templateVenues.forEach((tv: any) => {
        total += tv.venue?.price || 0;
      });
    }

    return total;
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
