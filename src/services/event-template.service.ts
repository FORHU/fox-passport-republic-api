import {
  EventCategory,
  MatchConstraint,
  MatchRequestStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../utils/prisma";
import EventTemplateRepo from "../repositories/event-template.repository";
import { PLATFORM_FEE_PERCENT } from "../config";

/** A money column as Prisma returns it, or a plain number from an in-memory draft. */
type Amount = Prisma.Decimal | number | null | undefined;

/**
 * Money columns come back as Prisma `Decimal`, whose `valueOf()` is a *string*.
 * `a + b` on two of those concatenates rather than adds, so every amount is
 * converted through here before arithmetic.
 */
function toAmount(value: Amount): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Price for one attached item: the negotiated price when there is one,
 * otherwise the supplier's listed price.
 *
 * `agreedPrice` is `Decimal @default(0)` and non-nullable, so it always arrives
 * as a *truthy object*. The original `agreedPrice || listed` therefore never
 * fell back, and items nobody had negotiated a price for were silently counted
 * as 0. Comparing the converted number restores the intended fallback.
 */
function itemPrice(agreedPrice: Amount, listedPrice: Amount): number {
  const agreed = toAmount(agreedPrice);
  return agreed > 0 ? agreed : toAmount(listedPrice);
}

interface PricedItem {
  /** Optional: the lite browse query selects prices without row ids. */
  id?: string;
  agreedPrice?: Amount;
}

/**
 * The minimum shape `calculateItemsTotal` needs. Deliberately structural rather
 * than a single `EventTemplateGetPayload`, because callers pass templates loaded
 * with different `include` sets as well as unsaved drafts.
 */
export interface TemplateForPricing {
  /** Percentage the Host adds on top of the summed item prices. */
  hostMarkupPct?: number | null;
  templateAssets?:
    | (PricedItem & {
        quantity?: number | null;
        asset?: { price?: Amount } | null;
      })[]
    | null;
  templateServices?:
    | (PricedItem & { service?: { price?: Amount } | null })[]
    | null;
  templateVenues?:
    | (PricedItem & { venue?: { price?: Amount } | null })[]
    | null;
}

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
    lat?: number;
    lng?: number;
    hostMarkupPct?: number;
    maxAttendees?: number;
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
      targetCity?: string;
      targetState?: string;
      targetCountry?: string;
      lat?: number;
      lng?: number;
      hostMarkupPct: number;
      maxAttendees: number | null;
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
    city?: string;
    page?: number;
    limit?: number;
  }) {
    const { templates, total } =
      await EventTemplateRepo.findAllTemplates(filters);
    // event_boost (Lvl 15) > featured_listing (Lvl 10) > unranked
    const { default: PassportSvc } = await import("./passport.service");
    const sorted = await PassportSvc.sortByFeaturedPerk(
      templates,
      ["event_boost", "featured_listing"],
      "ownerId",
    );
    return {
      templates: sorted.map((t) => {
        const totals = this.calculateTotalsBreakdown(t);
        return {
          ...t,
          ...totals,
          price: totals.totalAmount,
          rating: "rating" in t ? t.rating : null,
        };
      }),
      total,
    };
  }

  // Public browse for the search page — supports category/targetCity/maxPrice,
  // computes price + rating so the frontend cards have the fields they read.
  static async getPublicTemplatesLite(filters: {
    category?: string;
    targetCity?: string;
    city?: string;
    maxPrice?: number;
    isPublic?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { templates, total } =
      await EventTemplateRepo.findPublicTemplatesLite({
        category: filters.category,
        targetCity: filters.targetCity,
        city: filters.city,
        maxPrice: filters.maxPrice,
        isPublic: filters.isPublic,
        page: filters.page,
        limit: filters.limit ?? 50,
      });
    const { default: PassportSvc } = await import("./passport.service");
    const withTotals = templates.map((t) => {
      const totals = this.calculateTotalsBreakdown(t);
      return {
        ...t,
        ...totals,
        price: totals.totalAmount,
        rating: "rating" in t ? t.rating : null,
      };
    });
    const sorted = await PassportSvc.sortByFeaturedPerk(
      withTotals,
      ["event_boost", "featured_listing"],
      "ownerId",
    );
    // maxPrice is enforced after price computation (server-computed totalAmount)
    const filtered =
      filters.maxPrice != null
        ? sorted.filter((t) => (t.price ?? 0) <= filters.maxPrice!)
        : sorted;
    return { templates: filtered, total };
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
    template: TemplateForPricing,
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
      template.templateAssets.forEach((ta) => {
        if (ta.id && excludedAssetIds.includes(ta.id)) return;
        const price = itemPrice(ta.agreedPrice, ta.asset?.price);
        const qty = ta.quantity || 1;
        total += price * qty;
      });
    }

    // Sum Services
    if (template.templateServices) {
      template.templateServices.forEach((ts) => {
        if (ts.id && excludedServiceIds.includes(ts.id)) return;
        total += itemPrice(ts.agreedPrice, ts.service?.price);
      });
    }

    // Sum Venues
    if (template.templateVenues) {
      template.templateVenues.forEach((tv) => {
        if (tv.id && excludedVenueIds.includes(tv.id)) return;
        total += itemPrice(tv.agreedPrice, tv.venue?.price);
      });
    }

    return total;
  }

  /** @deprecated use calculateItemsTotal / calculateTotalsBreakdown */
  static calculateTotalAmount(template: TemplateForPricing): number {
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
    template: TemplateForPricing,
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

    // Only enforce location mismatch when both sides have explicit state/country data.
    // If either the template or the resource has no location set, allow the attachment.
    if (
      asset.state &&
      template.targetState &&
      (asset.state !== template.targetState ||
        asset.country !== template.targetCountry)
    ) {
      throw new Error(
        "Asset location mismatch. Please use matching search or override.",
      );
    }

    // Only enforce match data when matchedAt is provided (i.e., match-search flow).
    // Direct attachment from the builder does not require description/matchedAt.
    if (matchedAt) {
      this.validateMatchData(true, description, matchedAt);
    }

    // Default agreedPrice to the asset's own listed price (* quantity) when the Host
    // doesn't negotiate a different one — without this, agreedPrice silently defaults
    // to 0 at the repo layer, which is what providers actually get paid (the citizen's
    // total is computed from the live price, so an unset agreedPrice meant the citizen
    // was charged correctly but the provider would be paid $0).
    const finalAgreedPrice = agreedPrice ?? asset.price.toNumber() * quantity;

    return EventTemplateRepo.attachAsset(
      templateId,
      assetId,
      quantity,
      matchedAt
        ? { matched: true, matchConstraint: MatchConstraint.SAME_STATE }
        : undefined,
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
      service.state &&
      template.targetState &&
      (service.state !== template.targetState ||
        service.country !== template.targetCountry)
    ) {
      throw new Error(
        "Service location mismatch. Please use matching search or override.",
      );
    }

    if (matchedAt) {
      this.validateMatchData(true, description, matchedAt);
    }

    // See attachAsset's comment — default to the service's own listed price.
    const finalAgreedPrice = agreedPrice ?? service.price.toNumber();

    return EventTemplateRepo.attachService(
      templateId,
      serviceId,
      matchedAt
        ? { matched: true, matchConstraint: MatchConstraint.SAME_STATE }
        : undefined,
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

    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw new Error("Venue not found");

    if (
      venue.state &&
      template.targetState &&
      (venue.state !== template.targetState ||
        venue.country !== template.targetCountry)
    ) {
      throw new Error(
        "Venue location mismatch. Please use the Matching Search to find compatible venues or override the constraint.",
      );
    }

    if (matchedAt) {
      this.validateMatchData(true, description, matchedAt);
    }

    // See attachAsset's comment — default to the venue's own listed price.
    const finalAgreedPrice = agreedPrice ?? venue.price.toNumber();

    return EventTemplateRepo.attachVenue(
      templateId,
      venueId,
      matchedAt
        ? { matched: true, matchConstraint: MatchConstraint.SAME_STATE }
        : undefined,
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

    const filters: { state?: string; country?: string; category?: string } = {};
    if (params.scope === "state") {
      filters.state = template.targetState ?? undefined;
      filters.country = template.targetCountry ?? undefined;
    } else if (params.scope === "country") {
      filters.country = template.targetCountry ?? undefined;
    }
    if (params.category) filters.category = params.category;

    let results: {
      id: string;
      state: string | null;
      country: string | null;
    }[] = [];
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
    let provider: {
      id: string;
      state: string | null;
      country: string | null;
    } | null = null;
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

  // Returns all match requests sent by an EventFoxer across all their templates.
  static async getOutgoingMatchRequests(ownerId: string) {
    const templates = await prisma.eventTemplate.findMany({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        category: true,
        targetCity: true,
        targetState: true,
        templateAssets: {
          where: { matched: true },
          select: {
            id: true,
            matchRequestStatus: true,
            matchedAt: true,
            description: true,
            date: true,
            asset: {
              select: {
                id: true,
                name: true,
                owner: { select: { id: true, name: true, imgId: true } },
              },
            },
          },
        },
        templateServices: {
          where: { matched: true },
          select: {
            id: true,
            matchRequestStatus: true,
            matchedAt: true,
            description: true,
            date: true,
            service: {
              select: {
                id: true,
                name: true,
                owner: { select: { id: true, name: true, imgId: true } },
              },
            },
          },
        },
        templateVenues: {
          where: { matched: true },
          select: {
            id: true,
            matchRequestStatus: true,
            matchedAt: true,
            description: true,
            date: true,
            venue: {
              select: {
                id: true,
                name: true,
                mayor: { select: { id: true, name: true, imgId: true } },
              },
            },
          },
        },
      },
    });

    return templates.map((t) => ({
      templateId: t.id,
      templateName: t.name,
      category: t.category,
      targetCity: t.targetCity,
      targetState: t.targetState,
      requests: [
        ...t.templateAssets.map((a) => ({
          ...a,
          type: "asset" as const,
          provider: a.asset?.owner ?? null,
          item: a.asset,
        })),
        ...t.templateServices.map((s) => ({
          ...s,
          type: "service" as const,
          provider: s.service?.owner ?? null,
          item: s.service,
        })),
        ...t.templateVenues.map((v) => ({
          ...v,
          type: "venue" as const,
          provider: v.venue?.mayor ?? null,
          item: v.venue,
        })),
      ],
    }));
  }

  // Returns all match requests received by a provider (asset/service/venue owner).
  static async getIncomingMatchRequests(userId: string) {
    const [assets, services, venues] = await Promise.all([
      prisma.eventTemplateAsset.findMany({
        where: { matched: true, asset: { ownerId: userId } },
        select: {
          id: true,
          matchRequestStatus: true,
          matchedAt: true,
          description: true,
          date: true,
          asset: { select: { id: true, name: true } },
          template: {
            select: {
              id: true,
              name: true,
              category: true,
              targetCity: true,
              targetState: true,
              owner: { select: { id: true, name: true, imgId: true } },
            },
          },
        },
      }),
      prisma.eventTemplateService.findMany({
        where: { matched: true, service: { ownerId: userId } },
        select: {
          id: true,
          matchRequestStatus: true,
          matchedAt: true,
          description: true,
          date: true,
          service: { select: { id: true, name: true } },
          template: {
            select: {
              id: true,
              name: true,
              category: true,
              targetCity: true,
              targetState: true,
              owner: { select: { id: true, name: true, imgId: true } },
            },
          },
        },
      }),
      prisma.eventTemplateVenue.findMany({
        where: { matched: true, venue: { mayorId: userId } },
        select: {
          id: true,
          matchRequestStatus: true,
          matchedAt: true,
          description: true,
          date: true,
          venue: { select: { id: true, name: true } },
          template: {
            select: {
              id: true,
              name: true,
              category: true,
              targetCity: true,
              targetState: true,
              owner: { select: { id: true, name: true, imgId: true } },
            },
          },
        },
      }),
    ]);

    return [
      ...assets.map((a) => ({ ...a, type: "asset" as const, item: a.asset })),
      ...services.map((s) => ({
        ...s,
        type: "service" as const,
        item: s.service,
      })),
      ...venues.map((v) => ({ ...v, type: "venue" as const, item: v.venue })),
    ].sort(
      (a, b) =>
        new Date(b.matchedAt ?? 0).getTime() -
        new Date(a.matchedAt ?? 0).getTime(),
    );
  }

  // Provider accepts or declines a match request.
  static async respondToMatch(params: {
    matchId: string;
    type: "asset" | "service" | "venue";
    responderId: string;
    status: MatchRequestStatus;
  }) {
    if (
      params.status !== MatchRequestStatus.accepted &&
      params.status !== MatchRequestStatus.declined
    ) {
      throw new Error("status must be 'accepted' or 'declined'");
    }

    if (params.type === "asset") {
      const row = await prisma.eventTemplateAsset.findUnique({
        where: { id: params.matchId },
        include: { asset: true },
      });
      if (!row || row.asset?.ownerId !== params.responderId)
        throw new Error("Not found or unauthorized");
      return prisma.eventTemplateAsset.update({
        where: { id: params.matchId },
        data: { matchRequestStatus: params.status },
      });
    }
    if (params.type === "service") {
      const row = await prisma.eventTemplateService.findUnique({
        where: { id: params.matchId },
        include: { service: true },
      });
      if (!row || row.service?.ownerId !== params.responderId)
        throw new Error("Not found or unauthorized");
      return prisma.eventTemplateService.update({
        where: { id: params.matchId },
        data: { matchRequestStatus: params.status },
      });
    }
    if (params.type === "venue") {
      const row = await prisma.eventTemplateVenue.findUnique({
        where: { id: params.matchId },
        include: { venue: true },
      });
      if (!row || row.venue?.mayorId !== params.responderId)
        throw new Error("Not found or unauthorized");
      return prisma.eventTemplateVenue.update({
        where: { id: params.matchId },
        data: { matchRequestStatus: params.status },
      });
    }
    throw new Error("Invalid type");
  }
}
