import VenueRepo from "./venue.repository";
import {
  VenueStatus,
  BillingRate,
  VenueCategory,
  SystemRole,
  Prisma,
} from "@prisma/client";
import {
  LngLat,
  validatePolygon,
  polygonCentroid,
  polygonsOverlap,
  pointInPolygon,
} from "../../utils/geo";

export default class VenueSvc {
  /**
   * Admins may act on any venue; everyone else must own it.
   *
   * This takes a `SystemRole` specifically. It previously accepted a loose
   * string and also matched `"venueFoxer"`, which would have let any
   * VenueFoxer mutate any other VenueFoxer's venue had a RoleType ever been
   * passed in — ownership is the correct check for them, and it happens below.
   */
  private static isAdminRole(role?: SystemRole) {
    return role === "admin";
  }

  // Throws if the given service-area polygon overlaps a live (pending or
  // available) venue's polygon. `excludeId` lets an update check against
  // every venue but itself.
  private static async assertNoOverlap(boundary: LngLat[], excludeId?: string) {
    const candidates = await VenueRepo.findLiveVenuesWithBoundary(excludeId);

    for (const other of candidates) {
      if (!other.boundary) continue;
      const otherRing = other.boundary as unknown as LngLat[];
      if (polygonsOverlap(boundary, otherRing)) {
        throw new Error(
          `This venue's service area overlaps an existing venue: "${other.name}". Adjust the shape so they don't intersect.`,
        );
      }
    }
  }

  // ───────────────────────────────────────────────────────────
  // CREATE
  // ───────────────────────────────────────────────────────────

  static async createVenue(data: {
    mayorId: string;
    name: string;
    description: string;
    category: VenueCategory;
    capacity: number;
    address: string;
    city: string;
    state?: string;
    country: string;
    boundary?: LngLat[];
    imgIds: string[];
    spaceType?: string[];
    amenities?: string[];
    techAv?: string[];
    staffing?: string[];
    policies?: string[];
    status?: VenueStatus;
    price?: number;
    billingRate?: BillingRate;
  }) {
    // Business logic: validate business rules before creation
    if (data.price && data.price < 0) {
      throw new Error("Price cannot be negative");
    }
    if (data.capacity < 1) {
      throw new Error("Capacity must be at least 1");
    }
    if (!Array.isArray(data.imgIds) || data.imgIds.length === 0) {
      throw new Error("At least one image is required");
    }
    if (data.imgIds && data.imgIds.length > 5) {
      throw new Error("A maximum of 5 images is allowed");
    }

    // Every venue goes through admin review before it's live. `available`,
    // `rejected`, and `archived` are review-controlled states — only the
    // admin approve/reject endpoints may set them, so a create request can
    // only ever land on `draft` or `pending`, never anything the caller
    // claims beyond that. (This used to also let the venue_authority perk
    // skip straight to `available`, but that perk is granted at passport
    // level 1 — nearly every venueFoxer had it, so the review queue was
    // being bypassed by default rather than as an exception.)
    const finalStatus =
      data.status === VenueStatus.draft
        ? VenueStatus.draft
        : VenueStatus.pending;

    let centroid: { lat: number; lng: number } | undefined;

    if (finalStatus !== VenueStatus.draft) {
      if (!data.boundary) {
        throw new Error(
          "A service-area boundary is required to publish a venue",
        );
      }
      const validationError = validatePolygon(data.boundary);
      if (validationError) throw new Error(validationError);

      await this.assertNoOverlap(data.boundary);
      centroid = polygonCentroid(data.boundary);
    }

    const { boundary, ...rest } = data;
    const venue = await VenueRepo.createVenue({
      ...rest,
      state: data.state ?? undefined,
      lat: centroid?.lat,
      lng: centroid?.lng,
      boundary: boundary as unknown as Prisma.InputJsonValue | undefined,
      imgIds: data.imgIds,
      spaceType: data.spaceType ?? [],
      amenities: data.amenities ?? [],
      techAv: data.techAv ?? [],
      staffing: data.staffing ?? [],
      policies: data.policies ?? [],
      status: finalStatus,
      price: data.price ?? 0,
      billingRate: (data.billingRate as BillingRate) ?? BillingRate.daily,
    });

    // Award uploadVenue XP to the venueFoxer who created the listing
    import("../passport/passport.service")
      .then(({ default: P, XP_REWARDS, UserPath }) => {
        return P.awardXP(
          data.mayorId,
          UserPath.venueFoxer,
          XP_REWARDS.uploadVenue,
        );
      })
      .catch(() => {});

    return venue;
  }

  // ───────────────────────────────────────────────────────────
  // READ — Delegate all queries to repository
  // ───────────────────────────────────────────────────────────

  static async getVenues(filters?: {
    mayorId?: string;
    hostId?: string;
    page?: number;
    limit?: number;
  }) {
    const { venues, total } = await VenueRepo.findAllVenues(filters);
    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const sorted = await PassportSvc.sortByFeaturedPerk(
      venues,
      "venue_spotlight",
      "mayorId",
    );
    // Add city_badge / mayor_verified badge for each venue owner
    const enriched = await PassportSvc.enrichWithOwnerBadge(
      sorted,
      ["mayor_verified", "city_badge"],
      "mayorId",
    );
    return { venues: enriched, total };
  }

  static async getVenueById(id: string, requesterId?: string) {
    const venue = await VenueRepo.findVenueById(id);

    if (!venue) throw new Error("Venue not found");
    if (venue.status === VenueStatus.archived)
      throw new Error("Venue has been removed");

    const { default: PassportSvc } =
      await import("../passport/passport.service");
    const [inclusions, [enriched], viewerHasVipAccess] = await Promise.all([
      Promise.resolve(VenueSvc.computeInclusions(venue)),
      PassportSvc.enrichWithOwnerBadge(
        [venue],
        ["mayor_verified", "city_badge"],
        "mayorId",
      ),
      requesterId
        ? PassportSvc.hasPerk(requesterId, "vip_lounge")
        : Promise.resolve(false),
    ]);

    return { ...enriched, inclusions, viewerHasVipAccess };
  }

  // Derives a displayable inclusions list from venue's structured arrays
  private static computeInclusions(venue: {
    amenities: string[];
    techAv: string[];
    staffing: string[];
  }) {
    const ICON_MAP: Record<string, string> = {
      // amenities
      "air conditioning": "ac_unit",
      parking: "local_parking",
      restrooms: "wc",
      "catering kitchen": "soup_kitchen",
      pool: "pool",
      bar: "local_bar",
      elevator: "elevator",
      wifi: "wifi",
      "garden lighting": "light_mode",
      "bridal suite": "king_bed",
      // techAv
      projector: "videocam",
      "sound system": "speaker",
      microphone: "mic",
      "bluetooth speaker": "bluetooth_audio",
      "led walls": "tv",
      "led screen": "monitor",
      "full av system": "settings_input_hdmi",
      "live stream setup": "live_tv",
      "outdoor screen": "outdoor_garden",
      // staffing
      security: "security",
      janitor: "cleaning_services",
      gardener: "yard",
      concierge: "support_agent",
      lifeguard: "pool",
      "event coordinator": "event",
      "front desk": "contact_support",
    };

    const items: { name: string; icon: string; desc: string }[] = [];

    const addItems = (arr: string[], category: string) => {
      for (const raw of arr) {
        const key = raw.toLowerCase();
        items.push({
          name: raw.charAt(0).toUpperCase() + raw.slice(1),
          icon: ICON_MAP[key] ?? "check_circle",
          desc: `${category} included`,
        });
      }
    };

    addItems(venue.amenities, "Amenity");
    addItems(venue.techAv, "Tech & AV");
    addItems(venue.staffing, "Staffing");

    return items;
  }

  // Venues whose service-area polygon covers `point`.
  static async getVenuesCoveringPoint(point: { lat: number; lng: number }) {
    const candidates = await VenueRepo.findAvailableVenuesWithBoundary();
    const asLngLat: LngLat = [point.lng, point.lat];

    return candidates.filter((venue) => {
      if (!venue.boundary) return false;
      return pointInPolygon(asLngLat, venue.boundary as unknown as LngLat[]);
    });
  }

  // Lightweight location of every other live venue (boundary or pin-only) —
  // used as a read-only reference layer so a host can see what they'd
  // overlap while drawing, instead of only finding out from the
  // assertNoOverlap rejection on submit, and see other venues generally.
  static async getReferenceBoundaries(excludeId?: string) {
    const venues = await VenueRepo.findLiveVenuesForReference(excludeId);
    return venues.map((v) => ({
      id: v.id,
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      boundary: v.boundary,
      category: v.category,
      image: v.images[0]?.url ?? null,
    }));
  }

  static async getVenueByIdForMayor(id: string, mayorId: string) {
    // Mayor can see their own venues regardless of status
    const venue = await VenueRepo.findVenueByIdAndOwner(id, mayorId);
    if (!venue) {
      throw new Error("Venue not found or access denied");
    }
    return venue;
  }

  static async updateVenue(params: {
    id: string;
    requesterId: string;
    requesterRole?: SystemRole;
    data: Partial<{
      name: string;
      description: string;
      category: VenueCategory;
      capacity: number;
      price: number;
      address: string;
      city: string;
      state?: string;
      country: string;
      boundary: LngLat[];
      imgIds: string[];
      spaceType: string[];
      amenities: string[];
      techAv: string[];
      staffing: string[];
      policies: string[];
      status: VenueStatus;
      billingRate: BillingRate;
    }>;
  }) {
    const { id, requesterId, requesterRole, data } = params;

    const venue = await VenueRepo.findVenueById(id);
    if (!venue) throw new Error("Venue not found");

    const isAdmin = this.isAdminRole(requesterRole);
    if (!isAdmin && venue.mayorId !== requesterId) {
      throw new Error("Unauthorized");
    }

    if (data.price !== undefined && data.price < 0) {
      throw new Error("Price cannot be negative");
    }
    if (data.capacity !== undefined && data.capacity < 1) {
      throw new Error("Capacity must be at least 1");
    }
    if (data.imgIds && data.imgIds.length > 5) {
      throw new Error("A maximum of 5 images is allowed");
    }

    // Same rule as create: `available`/`rejected`/`archived` are
    // review-controlled and only reachable through the admin approve/reject
    // endpoints (or archiveVenue). A generic update can only move a venue
    // between `draft` and `pending` — a client-supplied `available` here
    // would otherwise let a host self-approve their own venue outright.
    const finalStatus =
      data.status === VenueStatus.draft || data.status === VenueStatus.pending
        ? data.status
        : venue.status;
    const resolvedBoundary =
      data.boundary ??
      (venue.boundary as unknown as LngLat[] | null) ??
      undefined;
    const boundaryChanged = data.boundary !== undefined;

    let centroid: { lat: number; lng: number } | undefined;

    if (finalStatus !== VenueStatus.draft) {
      if (!resolvedBoundary) {
        throw new Error(
          "A service-area boundary is required to publish a venue",
        );
      }
      const validationError = validatePolygon(resolvedBoundary);
      if (validationError) throw new Error(validationError);

      // Only worth re-checking when the shape itself moved, or when a draft
      // with no prior overlap check is being published for the first time.
      if (boundaryChanged || venue.status === VenueStatus.draft) {
        await this.assertNoOverlap(resolvedBoundary, id);
      }
      if (boundaryChanged) centroid = polygonCentroid(resolvedBoundary);
    }

    const { boundary, status: _rawStatus, ...rest } = data;
    return VenueRepo.updateVenue(id, {
      ...rest,
      // Never the raw `data.status` — always the clamped value, so a
      // client-requested `available`/`rejected`/`archived` can't slip
      // through this spread even though it was validated out above.
      ...(data.status !== undefined && { status: finalStatus }),
      ...(boundary !== undefined && {
        boundary: boundary as unknown as Prisma.InputJsonValue,
        lat: centroid?.lat,
        lng: centroid?.lng,
      }),
    });
  }

  static async deleteVenue(params: {
    id: string;
    requesterId: string;
    requesterRole?: SystemRole;
  }) {
    const { id, requesterId, requesterRole } = params;
    const venue = await VenueRepo.findVenueById(id);
    if (!venue) throw new Error("Venue not found");

    const isAdmin = this.isAdminRole(requesterRole);
    if (!isAdmin && venue.mayorId !== requesterId) {
      throw new Error("Unauthorized");
    }

    return VenueRepo.archiveVenue(id);
  }

  /**
   * Every venue, for the admin console. No ownership filter is applied here:
   * the route is already gated on `queue:read`.
   *
   * Pass-through. It exists so controllers reach the data layer through a
   * service, which `tools/validate-architecture.mjs` enforces.
   */
  static async findAllVenuesAdmin(filters?: {
    mayorId?: string;
    hostId?: string;
    status?: VenueStatus;
  }) {
    return VenueRepo.findAllVenuesAdmin(filters);
  }
}
