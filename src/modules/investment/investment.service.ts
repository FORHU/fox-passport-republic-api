import {
  InvestmentType,
  InventoryCategory,
  TransportPolicy,
  UserPath,
} from "@prisma/client";
import InvestmentRepo from "./investment.repository";
import UsersRepo from "../users/users.repository";
import FeedRepo from "../feed/feed.repository";
import PassportSvc from "../passport/passport.service";
import VenueRepo from "../venue/venue.repository";

export interface CreateInvestmentDTO {
  type: InvestmentType;
  title: string;
  description: string;
  inventoryCategory?: InventoryCategory;
  quantityTotal?: number;
  itemCondition?: string;
  monetaryValue?: number;
  usageTerms?: string;
  dailyRentalRate?: number;
  revenueSharePercent?: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
  deliveryRadiusKm?: number;
  transportPolicy?: TransportPolicy;
  targetVenueId?: string;
  targetEventId?: string;
  mediaUrls?: string[];
  broadcastToFeed?: boolean;
}

export default class InvestmentSvc {
  // CREATE INVESTMENT
  static async createInvestment(partnerId: string, data: CreateInvestmentDTO) {
    const user = await UsersRepo.findUserById(partnerId);
    if (!user) throw new Error("Partner not found");

    const isPartner =
      user.roleType?.includes("investor") || user.systemRole === "admin";
    if (!isPartner) {
      throw new Error(
        "Only Partner Foxers (investors) can register capital or inventory investments.",
      );
    }

    const { broadcastToFeed, targetVenueId, targetEventId, ...investmentData } =
      data;

    const investment = await InvestmentRepo.createInvestment({
      ...investmentData,
      monetaryValue: investmentData.monetaryValue ?? 0,
      quantityAvailable: investmentData.quantityTotal ?? 1,
      partner: { connect: { id: partnerId } },
      ...(targetVenueId
        ? { targetVenue: { connect: { id: targetVenueId } } }
        : {}),
      ...(targetEventId
        ? { targetEvent: { connect: { id: targetEventId } } }
        : {}),
    });

    // Award Partner XP for deploying capital / inventory into the Republic
    try {
      await PassportSvc.awardXP(partnerId, UserPath.investor, 50);
    } catch {
      // Non-fatal if passport progression error
    }

    // Optionally broadcast announcement card to the Republic Foxer Partners Feed
    if (broadcastToFeed) {
      try {
        const itemInfo =
          investment.type === "physical_inventory"
            ? `📦 [Inventory Hub] ${investment.quantityTotal}x ${investment.title} deployed at ${investment.city ?? "Depot"}, ${investment.country ?? "Republic"}. Terms: ${investment.usageTerms || "Available for partner venues"}.`
            : `💼 [Partner Capital] ${investment.title}: ₱${Number(investment.monetaryValue).toLocaleString()} allocated for venue / event growth.`;

        await FeedRepo.createPost({
          authorId: partnerId,
          type: "partner_announcement",
          tab: "partners",
          content: `${itemInfo}\n\n${investment.description}`,
          mediaUrls: investment.mediaUrls ?? [],
          venueId: investment.targetVenueId ?? null,
        });
      } catch (err) {
        console.error("Failed to auto-broadcast investment to feed:", err);
      }
    }

    return investment;
  }

  // GET LIST (Paginated)
  static async getInvestments(params: {
    type?: InvestmentType;
    category?: InventoryCategory;
    partnerId?: string;
    status?: string;
    country?: string;
    city?: string;
    limit?: number;
    page?: number;
  }) {
    return InvestmentRepo.findInvestments(params);
  }

  // GET MAP VIEW PINS
  static async getInvestmentsOnMap(params: {
    type?: InvestmentType;
    category?: InventoryCategory;
    country?: string;
    bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  }) {
    return InvestmentRepo.findInvestmentsOnMap(params);
  }

  // GET NEARBY INVENTORY FOR A VENUE (Equipment Pooling)
  static async getNearbyInventoryForVenue(params: {
    venueId: string;
    category?: InventoryCategory;
    maxRadiusKm?: number;
  }) {
    const venue = await VenueRepo.findVenueById(params.venueId);
    if (!venue) throw new Error("Venue not found");

    if (venue.lat == null || venue.lng == null) {
      return [];
    }

    return InvestmentRepo.findNearbyInventory({
      lat: venue.lat,
      lng: venue.lng,
      category: params.category,
      maxRadiusKm: params.maxRadiusKm,
    });
  }

  // GET SINGLE
  static async getInvestmentById(id: string) {
    const investment = await InvestmentRepo.findById(id);
    if (!investment) throw new Error("Investment not found");
    return investment;
  }
}
