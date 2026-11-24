import { AppError, badRequest, conflict, notFound } from "../../utils/errors";
import { acceptedMatchListings, type LineKind } from "./template-partners";
import {
  EventCategory,
  MatchConstraint,
  MatchDeclineReason,
  MatchRequestStatus,
  Prisma,
  VenueStatus,
} from "@prisma/client";
import { prisma } from "../../utils/prisma";
import EventTemplateRepo from "./event-template.repository";
import { listAuditForTarget, recordChangeBy } from "../audit/audit.service";

/** The package details its History tracks, as the template stores them. */
const HISTORY_FIELDS = [
  "name",
  "description",
  "category",
  "isPublic",
  "targetCity",
  "targetState",
  "targetCountry",
  "maxAttendees",
] as const;
import PricingSvc from "../pricing/pricing.service";
import {
  breakdownTotals,
  commissionPctOf,
  type EventBreakdown,
  type EventBreakdownExclusions,
  type EventTemplateForBreakdown,
  type MoneyInput,
} from "../pricing/event-breakdown";
import { eventTemplateCache } from "../../utils/cache-namespaces";
import { fingerprint } from "../../utils/cache.util";

/**
 * Two minutes.
 *
 * Templates are browsed far more than they are edited, and the listing reads
 * join through every attached asset, service and venue so the price can be
 * computed. The writes retire the namespace, so this bounds orphans.
 */
const TEMPLATE_TTL = 120;

/**
 * A template the price breakdown can run on: its items (see
 * `EventTemplateForBreakdown`) and its owner, whose one commission rate
 * applies to every Event they created (#264 D5). Every template query here
 * loads `owner.commissionPct`; a missing owner is refused, never priced at 0%.
 */
export type TemplateForPricing = EventTemplateForBreakdown & {
  ownerId?: string;
  owner?: { id?: string; commissionPct?: MoneyInput } | null;
};

/** What every template response adds: the totals under their old names, plus every line (#264 T6.4). */
type Priced<T> = T &
  ReturnType<typeof breakdownTotals> & {
    price: number;
    breakdown: EventBreakdown;
  };

/** A template shown without a price because it couldn't be priced (see `withBreakdownsForDisplay`). */
const UNPRICED = {
  itemsTotal: null,
  hostMarkupAmount: null,
  platformFeeAmount: null,
  processingFeeAmount: null,
  totalAmount: null,
  estimatedTotal: null,
  price: null,
  breakdown: null,
} as const;
type Unpriced<T> = T & typeof UNPRICED;

export default class EventTemplateSvc {
  static async createTemplate(data: {
    ownerId: string;
    name: string;
    description?: string;
    category: EventCategory;
    isPublic?: boolean;
    imgIds?: string[];
    targetCity?: string;
    targetState?: string;
    targetCountry?: string;
    lat?: number;
    lng?: number;
    maxAttendees?: number;
  }) {
    // A draft may be saved before it has a description (the Studio only
    // recommends one), but the column is required: store it empty.
    const template = await EventTemplateRepo.createTemplate({
      ...data,
      description: data.description ?? "",
    });
    return this.withBreakdownForDisplay(template);
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
      maxAttendees: number | null;
    }>;
  }) {
    const { id, ownerId, data } = params;
    const existing = await this.verifyOwnership(id, ownerId);
    const template = await EventTemplateRepo.updateTemplate(id, data);

    // The package's History: each detail that actually changed, before and
    // after. Only the owner can edit, so they are the actor.
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of HISTORY_FIELDS) {
      if (!(field in data)) continue;
      const from = existing[field] ?? null;
      const to = data[field] ?? null;
      if (from !== to) changes[field] = { from, to };
    }
    if (data.imgIds) {
      const before = existing.images
        .map((i) => i.id)
        .sort()
        .join();
      if ([...data.imgIds].sort().join() !== before) {
        changes.photos = {
          from: existing.images.length,
          to: data.imgIds.length,
        };
      }
    }
    if (Object.keys(changes).length > 0) {
      await recordChangeBy(ownerId, "package.edit", id, { changes });
    }

    return this.withBreakdownForDisplay(template);
  }

  /**
   * An item added to or removed from a package, for its History. Called by
   * the controller once the change succeeded. An item without an id is a
   * placeholder still to be matched, known by its description.
   */
  static async recordItemChange(
    ownerId: string,
    templateId: string,
    change: "add" | "remove",
    kind: "asset" | "service" | "venue",
    itemId?: string,
    description?: string,
  ) {
    await recordChangeBy(ownerId, `package.item.${change}`, templateId, {
      kind,
      ...(itemId ? { itemId } : {}),
      ...(description ? { description } : {}),
    });
  }

  /**
   * A package's History for its owner, newest first: edits to it, items added
   * and removed, and its bookings (booked, paid, checked in, cancelled). Who
   * did it is a name, never the email the audit row keeps: the owner sees
   * their guests here, and a guest's email is not theirs to see.
   */
  static async history(templateId: string, ownerId: string) {
    await this.verifyOwnership(templateId, ownerId);
    const entries = await listAuditForTarget(templateId);

    const itemIds = (kind: string) =>
      entries.flatMap((e) => {
        const m = e.metadata as { kind?: string; itemId?: string } | null;
        return m?.kind === kind && m.itemId ? [m.itemId] : [];
      });
    const names = await EventTemplateRepo.historyNames({
      userIds: entries.map((e) => e.actorId),
      assetIds: itemIds("asset"),
      serviceIds: itemIds("service"),
      venueIds: itemIds("venue"),
    });

    return entries.map((e) => {
      const metadata = (e.metadata ?? {}) as Record<string, unknown>;
      const itemId = metadata.itemId as string | undefined;
      return {
        id: e.id,
        at: e.createdAt,
        action: e.action,
        actor: { id: e.actorId, name: names.users.get(e.actorId) ?? null },
        ...metadata,
        ...(itemId ? { itemName: names.items.get(itemId) ?? null } : {}),
      };
    });
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
    // The database read is cached; the perk sort below is not. Featured
    // ranking comes from `passport`, which has its own lifetime and is not
    // this namespace's to retire.
    const { templates, total } = await eventTemplateCache.cached(
      `all:${fingerprint(filters ?? {})}`,
      TEMPLATE_TTL,
      () => EventTemplateRepo.findAllTemplates(filters),
    );
    // event_boost (Lvl 15) > featured_listing (Lvl 10) > unranked
    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const sorted = await PassportSvc.sortByFeaturedPerk(
      templates,
      ["event_boost", "featured_listing"],
      "ownerId",
    );
    const priced = await this.withBreakdownsForDisplay(sorted);
    return {
      templates: priced.map((t) => ({
        ...t,
        rating: "rating" in t ? t.rating : null,
      })),
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
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const { templates, total } = await eventTemplateCache.cached(
      `publicLite:${fingerprint(filters)}`,
      TEMPLATE_TTL,
      () =>
        EventTemplateRepo.findPublicTemplatesLite({
          category: filters.category,
          targetCity: filters.targetCity,
          city: filters.city,
          maxPrice: filters.maxPrice,
          isPublic: filters.isPublic,
          q: filters.q,
          page: filters.page,
          limit: filters.limit ?? 50,
        }),
    );
    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const withTotals = (await this.withBreakdownsForDisplay(templates)).map(
      (t) => ({
        ...t,
        rating: "rating" in t ? t.rating : null,
      }),
    );
    const sorted = await PassportSvc.sortByFeaturedPerk(
      withTotals,
      ["event_boost", "featured_listing"],
      "ownerId",
    );
    // maxPrice is enforced after price computation (server-computed totalAmount)
    const filtered =
      filters.maxPrice != null
        ? sorted.filter((t) => t.price != null && t.price <= filters.maxPrice!)
        : sorted;
    return { templates: filtered, total };
  }

  /**
   * Used by the book-from-template flow, which needs the item owners to write
   * its escrow rows. Returns null rather than throwing: the caller answers a
   * miss with "not found or not approved", which covers both halves of the
   * lookup without telling an outsider which one it was.
   */
  static async getPublicTemplateWithItemOwners(id: string) {
    return eventTemplateCache.cached(
      `publicWithOwners:${id}`,
      TEMPLATE_TTL,
      () => EventTemplateRepo.findPublicTemplateWithItemOwners(id),
    );
  }

  /**
   * The recommendation strip: the newest published templates.
   *
   * It used to return a `match` percentage - `Math.floor(Math.random() * 20) +
   * 80`, a number between 80 and 99 with no relationship to the person asking,
   * presented as a fit score. It is gone rather than replaced. Nothing renders
   * it (the dashboard reads `recommendations.length` and nothing else), and a
   * fabricated confidence score is worse than no score: it invites the reader
   * to trust a ranking that does not exist.
   *
   * If a real one is wanted, it needs an input - the citizen's passport path,
   * their bookings, their saved vibes - and this method takes no user at all.
   * That is the work, and it is not a one-line change.
   */
  static async getRecommendations(take = 6) {
    const templates = await eventTemplateCache.cached(
      `recommendations:${take}`,
      TEMPLATE_TTL,
      () => EventTemplateRepo.findRecommendations(take),
    );

    return templates.map((t) => ({
      id: t.id,
      title: t.name,
      category: t.category,
      image: t.images?.[0]?.url ?? null,
      location:
        [t.targetCity, t.targetCountry].filter(Boolean).join(", ") || null,
    }));
  }

  static async getTemplateById(id: string) {
    const template = await eventTemplateCache.cached(
      `byId:${id}`,
      TEMPLATE_TTL,
      () => EventTemplateRepo.findTemplateById(id),
    );
    if (!template) {
      throw notFound("Event template");
    }
    return this.withBreakdownForDisplay(template);
  }

  /**
   * The template with its full price breakdown (#264 T6): every Foxer line
   * with its commission, FoxPassport fee and processing fee, from
   * `PricingSvc`. This replaces the old `calculateTotalsBreakdown`, which
   * charged the fee on the commission and read a 1% fee as 100%.
   */
  static async withBreakdown<T extends TemplateForPricing>(
    template: T,
    exclusions?: EventBreakdownExclusions,
  ): Promise<Priced<T>> {
    const [priced] = await this.withBreakdowns([template], exclusions);
    return priced;
  }

  /** `withBreakdown` for a list, with one fee-rule query for all of them. */
  static async withBreakdowns<T extends TemplateForPricing>(
    templates: readonly T[],
    exclusions?: EventBreakdownExclusions,
  ): Promise<Priced<T>[]> {
    const breakdowns = await PricingSvc.calculateEventBreakdowns(
      templates.map((template) => ({
        template,
        commissionPct: this.ownerCommissionPct(template),
        exclusions,
        eventFoxerId: template.ownerId ?? template.owner?.id,
      })),
    );
    return templates.map((template, i) => ({
      ...template,
      ...breakdownTotals(breakdowns[i]),
      price: breakdowns[i].total,
      breakdown: breakdowns[i],
    }));
  }

  /**
   * `withBreakdowns` for showing templates (browse, detail, the response to
   * a save). A template that can't be priced (bad stored data, or no fee
   * rule) comes back with every amount `null` and the error logged, instead
   * of failing the whole page: the old pricing never threw, so one bad
   * template must not take the browse list down. Booking, requests and
   * checkout price with `PricingSvc` directly and still refuse.
   */
  static async withBreakdownsForDisplay<T extends TemplateForPricing>(
    templates: readonly T[],
  ): Promise<(Priced<T> | Unpriced<T>)[]> {
    try {
      return await this.withBreakdowns(templates);
    } catch {
      // Rare: price each on its own, so only the bad ones go unpriced.
      return Promise.all(
        templates.map(async (template) => {
          try {
            return await this.withBreakdown(template);
          } catch (e) {
            console.error(
              `Could not price event template ${(template as { id?: string }).id ?? "(no id)"}`,
              e,
            );
            return { ...template, ...UNPRICED };
          }
        }),
      );
    }
  }

  /** `withBreakdownsForDisplay` for one template. */
  static async withBreakdownForDisplay<T extends TemplateForPricing>(
    template: T,
  ): Promise<Priced<T> | Unpriced<T>> {
    const [shown] = await this.withBreakdownsForDisplay([template]);
    return shown;
  }

  /**
   * The template owner's commission rate. Refuses a template loaded without
   * its owner's rate rather than pricing it at 0%.
   */
  static ownerCommissionPct(template: TemplateForPricing): number {
    return commissionPctOf(template.owner?.commissionPct);
  }

  static async attachAsset(
    templateId: string,
    ownerId: string,
    assetId?: string,
    quantity: number = 1,
    description?: string,
    matchedAt?: Date,
    date?: Date,
    _agreedPrice?: number,
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
        undefined,
        isOptional,
      );
    }

    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) throw notFound("Template");

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw notFound("Asset");

    // Only enforce location mismatch when both sides have explicit state/country data.
    // If either the template or the resource has no location set, allow the attachment.
    if (
      asset.state &&
      template.targetState &&
      (asset.state !== template.targetState ||
        asset.country !== template.targetCountry)
    ) {
      throw new AppError(
        "Asset location mismatch. Please use matching search or override.",
        400,
      );
    }

    // Only enforce match data when matchedAt is provided (i.e., match-search flow).
    // Direct attachment from the builder does not require description/matchedAt.
    if (matchedAt) {
      this.validateMatchData(true, description, matchedAt);
    }

    // The Foxer's own listing price (* quantity), never one the EventFoxer
    // sends (#264 D1, C6): _agreedPrice is accepted for older callers and
    // ignored. Pricing reads the listing itself; this keeps the row honest.
    const finalAgreedPrice = asset.price.toNumber() * quantity;

    return EventTemplateRepo.attachAsset(
      templateId,
      assetId,
      quantity,
      await this.newLineRequest(
        "asset",
        ownerId,
        assetId,
        asset.ownerId,
        matchedAt,
      ),
      description,
      matchedAt,
      finalAgreedPrice,
      isOptional,
    );
  }

  /**
   * How a line starts when the Event Foxer adds a listing to a package
   * (api#459): as a request to its Supplier, which they accept or decline
   * (#447). Venues and Providers alike. It starts accepted when the listing
   * is the Event Foxer's own, or a partner's: a venue they hold an approved
   * affiliation with (`partner`), or a listing that accepted one of their
   * requests before. `matchedAt` (the match-search flow) also pins the line
   * to the package's state, as before.
   */
  private static async newLineRequest(
    kind: LineKind,
    hostId: string,
    listingId: string,
    supplierId: string | null | undefined,
    matchedAt?: Date,
    partner = false,
  ) {
    const agreed =
      supplierId === hostId ||
      partner ||
      (await acceptedMatchListings(hostId, kind, [listingId])).has(listingId);
    return {
      matched: true,
      matchRequestStatus: agreed
        ? MatchRequestStatus.accepted
        : MatchRequestStatus.pending,
      respondedAt: agreed ? new Date() : null,
      ...(matchedAt && { matchConstraint: MatchConstraint.SAME_STATE }),
    };
  }

  /**
   * Makes a line optional or required (api#459). The line, and its
   * Supplier's answer, stay: nothing they agreed to changes, since the price
   * is always their listing's own (#264 C6).
   */
  static async setLineOptional(
    templateId: string,
    ownerId: string,
    kind: LineKind,
    listingId: string,
    isOptional: boolean,
  ) {
    await this.verifyOwnership(templateId, ownerId);
    const { count } = await EventTemplateRepo.setLineOptional(
      kind,
      templateId,
      listingId,
      isOptional,
    );
    if (count === 0) throw notFound("Package item");
    return { templateId, kind, listingId, isOptional };
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
    _agreedPrice?: number,
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
        undefined,
        isOptional,
      );
    }

    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) throw notFound("Template");

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!service) throw notFound("Service");

    if (
      service.state &&
      template.targetState &&
      (service.state !== template.targetState ||
        service.country !== template.targetCountry)
    ) {
      throw new AppError(
        "Service location mismatch. Please use matching search or override.",
        400,
      );
    }

    if (matchedAt) {
      this.validateMatchData(true, description, matchedAt);
    }

    // See attachAsset: the service's own listing price, never the EventFoxer's.
    const finalAgreedPrice = service.price.toNumber();

    return EventTemplateRepo.attachService(
      templateId,
      serviceId,
      await this.newLineRequest(
        "service",
        ownerId,
        serviceId,
        service.ownerId,
        matchedAt,
      ),
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
    _agreedPrice?: number,
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
        undefined,
        isOptional,
      );
    }

    const template = await EventTemplateRepo.findTemplateById(templateId);
    if (!template) throw notFound("Template");

    // Event Studio re-sends the package's venue on every Publish. Attaching it
    // again used to add a second row for the same venue, which every total
    // then counted twice. Already there: nothing to do.
    const already = template.templateVenues.find(
      (tv) => tv.venueId === venueId,
    );
    if (already) return { ...already, alreadyAttached: true as const };

    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) throw notFound("Venue");

    // Any live venue can be added, as any Provider can (api#459): its Mayor
    // gets a request and accepts or declines. An approved affiliation with
    // "template:attach" makes the Event Foxer a partner: the venue joins at
    // once, at the affiliation's agreed price.
    let affiliation: { agreedPrice: Prisma.Decimal | null } | null = null;
    if (venue.mayorId !== ownerId) {
      if (venue.status !== VenueStatus.available) {
        throw new AppError("This venue isn't taking bookings", 400);
      }
      const { default: VenueAffiliationSvc } =
        await import("../venue-affiliation/venue-affiliation.service");
      affiliation =
        await VenueAffiliationSvc.getApprovedAffiliationWithPermission(
          venueId,
          ownerId,
          "template:attach",
        );
    }

    if (
      venue.state &&
      template.targetState &&
      (venue.state !== template.targetState ||
        venue.country !== template.targetCountry)
    ) {
      throw new AppError(
        "Venue location mismatch. Please use the Matching Search to find compatible venues or override the constraint.",
        400,
      );
    }

    if (matchedAt) {
      this.validateMatchData(true, description, matchedAt);
    }

    // The Mayor's own price for this EventFoxer: the affiliation's agreed
    // price when there is one, else the venue's listing price. Never one the
    // EventFoxer sends (#264 C6). Pricing looks the affiliation up itself
    // (PricingSvc.calculateEventBreakdowns), so the two always agree.
    const finalAgreedPrice =
      affiliation?.agreedPrice != null
        ? affiliation.agreedPrice.toNumber()
        : venue.price.toNumber();

    return EventTemplateRepo.attachVenue(
      templateId,
      venueId,
      await this.newLineRequest(
        "venue",
        ownerId,
        venueId,
        venue.mayorId,
        matchedAt,
        affiliation !== null,
      ),
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
      throw notFound("Event template");
    }
    if (template.ownerId !== ownerId) {
      throw new AppError("Unauthorized: You do not own this template", 403);
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
    if (!template) throw notFound("Template");

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

    if (!provider) throw notFound("Provider");

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
      throw new AppError(
        "Location mismatch. Use forceMatch=true to override.",
        400,
      );
    }

    // Conditional Validation Rule
    this.validateMatchData(true, params.description, params.matchedAt);

    // A new Provider, or a fresh ask after a decline, is a new invite: it
    // starts pending with no answer (api#447). Editing the details of an
    // invite the same Provider is still answering, or accepted, keeps it.
    const current =
      params.type === "venue"
        ? await prisma.eventTemplateVenue
            .findUnique({ where: { id: params.itemId } })
            .then(
              (r) => r && { holder: r.venueId, status: r.matchRequestStatus },
            )
        : params.type === "service"
          ? await prisma.eventTemplateService
              .findUnique({ where: { id: params.itemId } })
              .then(
                (r) =>
                  r && { holder: r.serviceId, status: r.matchRequestStatus },
              )
          : await prisma.eventTemplateAsset
              .findUnique({ where: { id: params.itemId } })
              .then(
                (r) => r && { holder: r.assetId, status: r.matchRequestStatus },
              );
    const freshInvite =
      !current ||
      current.holder !== params.providerId ||
      current.status === MatchRequestStatus.declined;

    const matchData = {
      matched: true,
      matchConstraint: constraint,
      description: params.description,
      matchedAt: params.matchedAt,
      date: params.date,
      ...(freshInvite && {
        matchRequestStatus: MatchRequestStatus.pending,
        declineReason: null,
        declineNote: null,
        respondedAt: null,
      }),
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
        throw new AppError(
          "Validation Error: 'description' and 'matchedAt' are required when item is matched.",
          400,
        );
      }
    }
  }

  // Returns all match requests sent by an EventFoxer across all their templates.
  static async getOutgoingMatchRequests(ownerId: string) {
    return eventTemplateCache.cached(
      `matchRequests:outgoing:${ownerId}`,
      TEMPLATE_TTL,
      () => this.loadOutgoingMatchRequests(ownerId),
    );
  }

  private static async loadOutgoingMatchRequests(ownerId: string) {
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
            agreedPrice: true,
            currency: true,
            declineReason: true,
            declineNote: true,
            respondedAt: true,
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
            agreedPrice: true,
            currency: true,
            declineReason: true,
            declineNote: true,
            respondedAt: true,
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
            agreedPrice: true,
            currency: true,
            declineReason: true,
            declineNote: true,
            respondedAt: true,
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
    return eventTemplateCache.cached(
      `matchRequests:incoming:${userId}`,
      TEMPLATE_TTL,
      () => this.loadIncomingMatchRequests(userId),
    );
  }

  private static async loadIncomingMatchRequests(userId: string) {
    const [assets, services, venues] = await Promise.all([
      prisma.eventTemplateAsset.findMany({
        where: { matched: true, asset: { ownerId: userId } },
        select: {
          id: true,
          matchRequestStatus: true,
          agreedPrice: true,
          currency: true,
          declineReason: true,
          declineNote: true,
          respondedAt: true,
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
          agreedPrice: true,
          currency: true,
          declineReason: true,
          declineNote: true,
          respondedAt: true,
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
          agreedPrice: true,
          currency: true,
          declineReason: true,
          declineNote: true,
          respondedAt: true,
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

  /**
   * A Provider accepts or declines a package invite (a matched template
   * line). A decline names a reason the Event Foxer sees; `other` needs a
   * note (api#447). An invite is answered once: only a pending one can be.
   */
  static async respondToMatch(params: {
    matchId: string;
    type: "asset" | "service" | "venue";
    responderId: string;
    status: MatchRequestStatus;
    reason?: MatchDeclineReason;
    note?: string;
  }) {
    if (
      params.status !== MatchRequestStatus.accepted &&
      params.status !== MatchRequestStatus.declined
    ) {
      throw new AppError("status must be 'accepted' or 'declined'", 400);
    }
    const declining = params.status === MatchRequestStatus.declined;
    const note = params.note?.trim() || null;
    if (declining && !params.reason) {
      throw badRequest("Choose why you're declining");
    }
    if (declining && params.reason === MatchDeclineReason.other && !note) {
      throw badRequest("Add a note when the reason is Other");
    }

    const found =
      params.type === "asset"
        ? await prisma.eventTemplateAsset
            .findUnique({
              where: { id: params.matchId },
              include: { asset: { select: { ownerId: true } } },
            })
            .then((r) => r && { ...r, ownerId: r.asset?.ownerId })
        : params.type === "service"
          ? await prisma.eventTemplateService
              .findUnique({
                where: { id: params.matchId },
                include: { service: { select: { ownerId: true } } },
              })
              .then((r) => r && { ...r, ownerId: r.service?.ownerId })
          : params.type === "venue"
            ? await prisma.eventTemplateVenue
                .findUnique({
                  where: { id: params.matchId },
                  include: { venue: { select: { mayorId: true } } },
                })
                .then((r) => r && { ...r, ownerId: r.venue?.mayorId })
            : undefined;
    if (found === undefined) throw new AppError("Invalid type", 400);
    if (!found || !found.matched || found.ownerId !== params.responderId) {
      throw new AppError("Not found or unauthorized", 404);
    }
    if (found.matchRequestStatus !== MatchRequestStatus.pending) {
      throw conflict("You've already answered this invite");
    }

    const data = {
      matchRequestStatus: params.status,
      respondedAt: new Date(),
      declineReason: declining ? params.reason : null,
      declineNote: declining ? note : null,
    };
    // Only a still-pending row changes, so two answers at once can't both win.
    const where = {
      id: params.matchId,
      matchRequestStatus: MatchRequestStatus.pending,
    };
    const { count } =
      params.type === "asset"
        ? await prisma.eventTemplateAsset.updateMany({ where, data })
        : params.type === "service"
          ? await prisma.eventTemplateService.updateMany({ where, data })
          : await prisma.eventTemplateVenue.updateMany({ where, data });
    if (count === 0) throw conflict("You've already answered this invite");

    // Both the Provider's and the Event Foxer's lists are cached.
    await eventTemplateCache.invalidateAll();
    return { id: params.matchId, type: params.type, ...data };
  }

  /**
   * Trending templates in a category, ranked by approved event count.
   *
   * Pass-through. It exists so controllers reach the data layer through a
   * service, which `tools/validate-architecture.mjs` enforces.
   */
  static async findTrendingByCategory(category: string, limit = 4) {
    return eventTemplateCache.cached(
      `trending:${category}:${limit}`,
      TEMPLATE_TTL,
      () => EventTemplateRepo.findTrendingByCategory(category, limit),
    );
  }
}
