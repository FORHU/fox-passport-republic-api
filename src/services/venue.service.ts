import VenueRepo from "../repositories/venue.repository";
import { VenueStatus, BillingRate, VenueCategory } from "@prisma/client";

export default class VenueSvc {
  private static isAdminRole(role?: string) {
    return role ? ["admin", "super_admin", "venueFoxer"].includes(role) : false;
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

    // venue_authority perk: skip the review queue and auto-approve
    const { default: PassportSvc } = await import("./passport.service");
    const hasVenueAuthority = await PassportSvc.hasPerk(
      data.mayorId,
      "venue_authority",
    );

    const venue = await VenueRepo.createVenue({
      ...data,
      state: data.state ?? undefined,
      imgIds: data.imgIds,
      spaceType: data.spaceType ?? [],
      amenities: data.amenities ?? [],
      techAv: data.techAv ?? [],
      staffing: data.staffing ?? [],
      policies: data.policies ?? [],
      status: hasVenueAuthority
        ? VenueStatus.available
        : (data.status ?? VenueStatus.pending),
      price: data.price ?? 0,
      billingRate: (data.billingRate as BillingRate) ?? BillingRate.daily,
    });

    // Award uploadVenue XP to the venueFoxer who created the listing
    import("./passport.service")
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

  static async getVenues(filters?: { mayorId?: string; hostId?: string; page?: number; limit?: number }) {
    const { venues, total } = await VenueRepo.findAllVenues(filters);
    const { default: PassportSvc } = await import("./passport.service");
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

    const { default: PassportSvc } = await import("./passport.service");
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
    requesterRole?: string;
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

    return VenueRepo.updateVenue(id, data);
  }

  static async deleteVenue(params: {
    id: string;
    requesterId: string;
    requesterRole?: string;
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
}
