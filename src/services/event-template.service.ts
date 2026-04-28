import { EventCategory, MatchConstraint } from "@prisma/client";
import { prisma } from "../utils/prisma";
import EventTemplateRepo from "../repositories/event-template.repository";

export default class EventTemplateSvc {
  static async createTemplate(data: {
    ownerId: string;
    name: string;
    description: string;
    category: EventCategory;
    isPublic?: boolean;
    imgIds?: string[];
    targetCity?: string;
    targetState?: string;
    targetCountry?: string;
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
      category: EventCategory;
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

  static async attachAsset(templateId: string, ownerId: string, assetId?: string, quantity: number = 1, description?: string, matchedAt?: Date, date?: Date) {
    await this.verifyOwnership(templateId, ownerId);
    
    if (!assetId) {
      return EventTemplateRepo.attachAsset(templateId, undefined, quantity, undefined, description, matchedAt);
    }

    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) throw new Error("Template not found");

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new Error("Asset not found");

    // Location validation for immediate match
    if (asset.state !== template.targetState || asset.country !== template.targetCountry) {
      throw new Error("Asset location mismatch. Please use matching search or override.");
    }

    // Conditional Validation Rule
    this.validateMatchData(true, description, matchedAt);

    return EventTemplateRepo.attachAsset(templateId, assetId, quantity, {
      matched: true,
      matchConstraint: MatchConstraint.SAME_STATE
    }, description, matchedAt);
  }

  static async removeAsset(templateId: string, ownerId: string, assetId: string) {
    await this.verifyOwnership(templateId, ownerId);
    await EventTemplateRepo.removeAsset(templateId, assetId);
    return { message: "Asset removed from template" };
  }

  static async attachService(templateId: string, ownerId: string, serviceId?: string, description?: string, matchedAt?: Date, date?: Date) {
    await this.verifyOwnership(templateId, ownerId);
    
    if (!serviceId) {
      return EventTemplateRepo.attachService(templateId, undefined, undefined, description, matchedAt);
    }

    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) throw new Error("Template not found");

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new Error("Service not found");

    // Location validation for immediate match
    if (service.state !== template.targetState || service.country !== template.targetCountry) {
      throw new Error("Service location mismatch. Please use matching search or override.");
    }

    // Conditional Validation Rule
    this.validateMatchData(true, description, matchedAt);

    return EventTemplateRepo.attachService(templateId, serviceId, {
      matched: true,
      matchConstraint: MatchConstraint.SAME_STATE
    }, description, matchedAt);
  }

  static async removeService(templateId: string, ownerId: string, serviceId: string) {
    await this.verifyOwnership(templateId, ownerId);
    await EventTemplateRepo.removeService(templateId, serviceId);
    return { message: "Service removed from template" };
  }

  static async attachVenue(templateId: string, ownerId: string, venueId?: string, description?: string, matchedAt?: Date, date?: Date) {
    await this.verifyOwnership(templateId, ownerId);
    
    if (!venueId) {
      return EventTemplateRepo.attachVenue(templateId, undefined as any, undefined, description, matchedAt);
    }

    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) throw new Error("Template not found");

    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error("Venue not found");

    // Default matching logic for immediate attachment
    if (venue.state !== template.targetState || venue.country !== template.targetCountry) {
      throw new Error("Venue location mismatch. Please use the Matching Search to find compatible venues or override the constraint.");
    }

    // Conditional Validation Rule
    this.validateMatchData(true, description, matchedAt);

    return EventTemplateRepo.attachVenue(templateId, venueId, {
      matched: true,
      matchConstraint: MatchConstraint.SAME_STATE
    }, description, matchedAt);
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
    return template;
  }

  static async matchSearch(params: { templateId: string; type: string; scope: string; category?: string }) {
    const template = await EventTemplateRepo.findTemplateById(params.templateId);
    if (!template) throw new Error("Template not found");

    const filters: any = {};
    if (params.scope === "state") {
      filters.state = template.targetState;
      filters.country = template.targetCountry;
    } else if (params.scope === "country") {
      filters.country = template.targetCountry;
    }
    if (params.category) filters.category = params.category;

    let results: any[] = [];
    if (params.type === "venue") results = await EventTemplateRepo.searchVenuesByLocation(filters);
    else if (params.type === "service") results = await EventTemplateRepo.searchServicesByLocation(filters);
    else if (params.type === "asset") results = await EventTemplateRepo.searchAssetsByLocation(filters);

    const scored = results.map(item => {
      const sameState = item.state === template.targetState && item.country === template.targetCountry;
      const sameCountry = !sameState && item.country === template.targetCountry;
      const matchScope = sameState ? "state" : sameCountry ? "country" : "manual";
      // Lower sortOrder = higher priority (state match first, then country, then manual)
      const sortOrder = sameState ? 0 : sameCountry ? 1 : 2;
      return { ...item, isMatched: sameState || sameCountry, matchScope, sortOrder };
    });

    return scored.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  static async matchItem(params: { 
    templateId: string; 
    ownerId: string; 
    itemId: string; 
    type: string; 
    providerId: string; 
    forceMatch?: boolean;
    description?: string;
    matchedAt?: Date;
    date?: Date;
  }) {
    const template = await this.verifyOwnership(params.templateId, params.ownerId);
    
    // Fetch provider to validate location
    let provider: any;
    if (params.type === "venue") provider = await prisma.venue.findUnique({ where: { id: params.providerId } });
    else if (params.type === "service") provider = await prisma.service.findUnique({ where: { id: params.providerId } });
    else if (params.type === "asset") provider = await prisma.asset.findUnique({ where: { id: params.providerId } });

    if (!provider) throw new Error("Provider not found");

    // Determine constraint
    let constraint: MatchConstraint = MatchConstraint.NONE;
    if (provider.state === template.targetState && provider.country === template.targetCountry) {
      constraint = MatchConstraint.SAME_STATE;
    } else if (provider.country === template.targetCountry) {
      constraint = MatchConstraint.BROADER;
    } else {
      constraint = MatchConstraint.MANUAL_OVERRIDE;
    }

    if (constraint === MatchConstraint.MANUAL_OVERRIDE && !params.forceMatch) {
      throw new Error("Location mismatch. Use forceMatch=true to override.");
    }

    // Conditional Validation Rule
    this.validateMatchData(true, params.description, params.matchedAt);

    const matchData = {
      matched: true,
      matchConstraint: constraint,
      description: params.description,
      matchedAt: params.matchedAt,
      date: params.date
    };

    if (params.type === "venue") return EventTemplateRepo.updateVenueMatch(params.itemId, { ...matchData, venueId: params.providerId });
    if (params.type === "service") return EventTemplateRepo.updateServiceMatch(params.itemId, { ...matchData, serviceId: params.providerId });
    if (params.type === "asset") return EventTemplateRepo.updateAssetMatch(params.itemId, { ...matchData, assetId: params.providerId });
  }

  private static validateMatchData(matched: boolean, description?: string, matchedAt?: Date) {
    if (matched) {
      if (!description || !matchedAt) {
        throw new Error("Validation Error: 'description' and 'matchedAt' are required when item is matched.");
      }
    }
  }
}
