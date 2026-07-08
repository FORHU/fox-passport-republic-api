import { EventCategory, MatchConstraint } from "@prisma/client";
import { prisma } from "../utils/prisma";
import EventTemplateRepo from "../repositories/event-template.repository";
import { PLATFORM_FEE_PERCENT } from "../config";

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
    hostMarkupPct?: number;
  }) {
    const template = await EventTemplateRepo.createTemplate(data);
    return {
      ...template,
      ...this.calculateTotalsBreakdown(template),
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
      hostMarkupPct: number;
    }>;
  }) {
    const { id, ownerId, data } = params;
    await this.verifyOwnership(id, ownerId);
    const template = await EventTemplateRepo.updateTemplate(id, data);
    return {
      ...template,
      ...this.calculateTotalsBreakdown(template),
    };
  }

  static async submitTemplate(id: string, ownerId: string) {
    return EventTemplateRepo.submitTemplate(id, ownerId);
  }

  static async getTemplates(filters?: {
    ownerId?: string;
    isPublic?: boolean;
    category?: string;
  }) {
    const templates = await EventTemplateRepo.findAllTemplates(filters);
    return templates.map((t) => ({
      ...t,
      ...this.calculateTotalsBreakdown(t),
    }));
  }

  // Lightweight browse for landing page — no price calculation, minimal joins
  static async getPublicTemplatesLite(filters: {
    category?: string;
    limit?: number;
  }) {
    return EventTemplateRepo.findPublicTemplatesLite({
      category: filters.category,
      limit: filters.limit ?? 8,
    });
  }

  static async getTemplateById(id: string) {
    const template = await EventTemplateRepo.findTemplateById(id);
    if (!template) {
      throw new Error("Event template not found");
    }
    return {
      ...template,
      ...this.calculateTotalsBreakdown(template),
    };
  }

  /**
   * Sum the raw price of all (non-excluded) items in the template — no markup,
   * no platform fee. Used as the base for calculateTotalsBreakdown, and kept
   * standalone since a few callers only need the raw supplier total.
   */
  static calculateItemsTotal(
    template: any,
    exclusions?: {
      excludedAssetIds?: string[];
      excludedServiceIds?: string[];
      excludedVenueIds?: string[];
    },
  ): number {
    const excludedAssetIds = exclusions?.excludedAssetIds ?? [];
    const excludedServiceIds = exclusions?.excludedServiceIds ?? [];
    const excludedVenueIds = exclusions?.excludedVenueIds ?? [];
    let total = 0;

    // Sum Assets
    if (template.templateAssets) {
      template.templateAssets.forEach((ta: any) => {
        if (excludedAssetIds.includes(ta.id)) return;
        const price = ta.agreedPrice || ta.asset?.price || 0;
        const qty = ta.quantity || 1;
        total += price * qty;
      });
    }

    // Sum Services
    if (template.templateServices) {
      template.templateServices.forEach((ts: any) => {
        if (excludedServiceIds.includes(ts.id)) return;
        const price = ts.agreedPrice || ts.service?.price || 0;
        total += price;
      });
    }

    // Sum Venues
    if (template.templateVenues) {
      template.templateVenues.forEach((tv: any) => {
        if (excludedVenueIds.includes(tv.id)) return;
        const price = tv.agreedPrice || tv.venue?.price || 0;
        total += price;
      });
    }

    return total;
  }

  /** @deprecated use calculateItemsTotal / calculateTotalsBreakdown */
  static calculateTotalAmount(template: any): number {
    return this.calculateItemsTotal(template);
  }

  /**
   * Full server-computed price breakdown for an EventTemplate. This is the only
   * source of truth for what a citizen owes when booking from a template — never
   * trust a client-supplied totalAmount (see docs/adr/0001-host-markup-and-server-computed-event-total.md).
   *
   * platformFee is additive on top of itemsTotal + hostMarkup, never carved out of
   * the Host's or any provider's share (see docs/adr/0002-stripe-connect-payouts.md).
   */
  static calculateTotalsBreakdown(
    template: any,
    exclusions?: {
      excludedAssetIds?: string[];
      excludedServiceIds?: string[];
      excludedVenueIds?: string[];
    },
    platformFeePercent: number = PLATFORM_FEE_PERCENT,
  ): {
    itemsTotal: number;
    hostMarkupAmount: number;
    platformFeeAmount: number;
    totalAmount: number;
    estimatedTotal: number;
  } {
    const itemsTotal = this.calculateItemsTotal(template, exclusions);
    const hostMarkupAmount = itemsTotal * ((template.hostMarkupPct ?? 0) / 100);
    const platformFeeAmount =
      (itemsTotal + hostMarkupAmount) * (platformFeePercent / 100);
    const totalAmount = itemsTotal + hostMarkupAmount + platformFeeAmount;

    return {
      itemsTotal,
      hostMarkupAmount,
      platformFeeAmount,
      totalAmount,
      estimatedTotal: totalAmount, // kept for backward compatibility with existing API consumers
    };
  }

  static async attachAsset(
    templateId: string,
    ownerId: string,
    assetId?: string,
    quantity: number = 1,
    description?: string,
    matchedAt?: Date,
    date?: Date,
    agreedPrice?: number,
    isOptional?: boolean,
  ) {
    await this.verifyOwnership(templateId, ownerId);

    if (!assetId) {
      return EventTemplateRepo.attachAsset(
        templateId,
        undefined,
        quantity,
        undefined,
        description,
        matchedAt,
        agreedPrice,
        isOptional,
      );
    }

    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) throw new Error("Template not found");

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw new Error("Asset not found");

    if (
      asset.state !== template.targetState ||
      asset.country !== template.targetCountry
    ) {
      throw new Error(
        "Asset location mismatch. Please use matching search or override.",
      );
    }

    this.validateMatchData(true, description, matchedAt);

    // Default agreedPrice to the asset's own listed price (* quantity) when the Host
    // doesn't negotiate a different one — without this, agreedPrice silently defaults
    // to 0 at the repo layer, which is what providers actually get paid (the citizen's
    // total is computed from the live price, so an unset agreedPrice meant the citizen
    // was charged correctly but the provider would be paid $0).
    const finalAgreedPrice = agreedPrice ?? asset.price * quantity;

    return EventTemplateRepo.attachAsset(
      templateId,
      assetId,
      quantity,
      {
        matched: true,
        matchConstraint: MatchConstraint.SAME_STATE,
      },
      description,
      matchedAt,
      finalAgreedPrice,
      isOptional,
    );
  }

  static async removeAsset(
    templateId: string,
    ownerId: string,
    assetId: string,
  ) {
    await this.verifyOwnership(templateId, ownerId);
    await EventTemplateRepo.removeAsset(templateId, assetId);
    return { message: "Asset removed from template" };
  }

  static async attachService(
    templateId: string,
    ownerId: string,
    serviceId?: string,
    description?: string,
    matchedAt?: Date,
    date?: Date,
    agreedPrice?: number,
    isOptional?: boolean,
  ) {
    await this.verifyOwnership(templateId, ownerId);

    if (!serviceId) {
      return EventTemplateRepo.attachService(
        templateId,
        undefined,
        undefined,
        description,
        matchedAt,
        agreedPrice,
        isOptional,
      );
    }

    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) throw new Error("Template not found");

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!service) throw new Error("Service not found");

    if (
      service.state !== template.targetState ||
      service.country !== template.targetCountry
    ) {
      throw new Error(
        "Service location mismatch. Please use matching search or override.",
      );
    }

    this.validateMatchData(true, description, matchedAt);

    // See attachAsset's comment — default to the service's own listed price.
    const finalAgreedPrice = agreedPrice ?? service.price;

    return EventTemplateRepo.attachService(
      templateId,
      serviceId,
      {
        matched: true,
        matchConstraint: MatchConstraint.SAME_STATE,
      },
      description,
      matchedAt,
      finalAgreedPrice,
      isOptional,
    );
  }

  static async removeService(
    templateId: string,
    ownerId: string,
    serviceId: string,
  ) {
    await this.verifyOwnership(templateId, ownerId);
    await EventTemplateRepo.removeService(templateId, serviceId);
    return { message: "Service removed from template" };
  }

  static async attachVenue(
    templateId: string,
    ownerId: string,
    venueId?: string,
    description?: string,
    matchedAt?: Date,
    date?: Date,
    agreedPrice?: number,
    isOptional?: boolean,
  ) {
    await this.verifyOwnership(templateId, ownerId);

    if (!venueId) {
      return EventTemplateRepo.attachVenue(
        templateId,
        undefined as any,
        undefined,
        description,
        matchedAt,
        agreedPrice,
        isOptional,
      );
    }

    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) throw new Error("Template not found");

    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error("Venue not found");

    if (
      venue.state !== template.targetState ||
      venue.country !== template.targetCountry
    ) {
      throw new Error(
        "Venue location mismatch. Please use the Matching Search to find compatible venues or override the constraint.",
      );
    }

    this.validateMatchData(true, description, matchedAt);

    // See attachAsset's comment — default to the venue's own listed price.
    const finalAgreedPrice = agreedPrice ?? venue.price;

    return EventTemplateRepo.attachVenue(
      templateId,
      venueId,
      {
        matched: true,
        matchConstraint: MatchConstraint.SAME_STATE,
      },
      description,
      matchedAt,
      finalAgreedPrice,
      isOptional,
    );
  }

  static async removeVenue(
    templateId: string,
    ownerId: string,
    venueId: string,
  ) {
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

  static async matchSearch(params: {
    templateId: string;
    type: string;
    scope: string;
    category?: string;
  }) {
    const template = await EventTemplateRepo.findTemplateById(
      params.templateId,
    );
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
    if (params.type === "venue")
      results = await EventTemplateRepo.searchVenuesByLocation(filters);
    else if (params.type === "service")
      results = await EventTemplateRepo.searchServicesByLocation(filters);
    else if (params.type === "asset")
      results = await EventTemplateRepo.searchAssetsByLocation(filters);

    const scored = results.map((item) => {
      const sameState =
        item.state === template.targetState &&
        item.country === template.targetCountry;
      const sameCountry = !sameState && item.country === template.targetCountry;
      const matchScope = sameState
        ? "state"
        : sameCountry
          ? "country"
          : "manual";
      // Lower sortOrder = higher priority (state match first, then country, then manual)
      const sortOrder = sameState ? 0 : sameCountry ? 1 : 2;
      return {
        ...item,
        isMatched: sameState || sameCountry,
        matchScope,
        sortOrder,
      };
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
    const template = await this.verifyOwnership(
      params.templateId,
      params.ownerId,
    );

    // Fetch provider to validate location
    let provider: any;
    if (params.type === "venue")
      provider = await prisma.venue.findUnique({
        where: { id: params.providerId },
      });
    else if (params.type === "service")
      provider = await prisma.service.findUnique({
        where: { id: params.providerId },
      });
    else if (params.type === "asset")
      provider = await prisma.asset.findUnique({
        where: { id: params.providerId },
      });

    if (!provider) throw new Error("Provider not found");

    // Determine constraint
    let constraint: MatchConstraint = MatchConstraint.NONE;
    if (
      provider.state === template.targetState &&
      provider.country === template.targetCountry
    ) {
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
      date: params.date,
    };

    if (params.type === "venue")
      return EventTemplateRepo.updateVenueMatch(params.itemId, {
        ...matchData,
        venueId: params.providerId,
      });
    if (params.type === "service")
      return EventTemplateRepo.updateServiceMatch(params.itemId, {
        ...matchData,
        serviceId: params.providerId,
      });
    if (params.type === "asset")
      return EventTemplateRepo.updateAssetMatch(params.itemId, {
        ...matchData,
        assetId: params.providerId,
      });
  }

  private static validateMatchData(
    matched: boolean,
    description?: string,
    matchedAt?: Date,
  ) {
    if (matched) {
      if (!description || !matchedAt) {
        throw new Error(
          "Validation Error: 'description' and 'matchedAt' are required when item is matched.",
        );
      }
    }
  }
}
