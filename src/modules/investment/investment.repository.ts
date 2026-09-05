import { Prisma, InvestmentType, InventoryCategory } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { totalPages } from "../../utils/pagination";

export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default class InvestmentRepo {
  // CREATE
  static async createInvestment(data: Prisma.PartnerInvestmentCreateInput) {
    return prisma.partnerInvestment.create({
      data,
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            username: true,
            imgId: true,
            roleType: true,
          },
        },
        targetVenue: {
          select: { id: true, name: true, city: true },
        },
        targetEvent: {
          select: { id: true, name: true },
        },
      },
    });
  }

  // FIND ALL (Paginated)
  static async findInvestments(params: {
    type?: InvestmentType;
    category?: InventoryCategory;
    partnerId?: string;
    status?: string;
    country?: string;
    city?: string;
    limit?: number;
    page?: number;
  }) {
    const limit = Math.min(params.limit || 20, 100);
    const page = Math.max(params.page || 1, 1);
    const skip = (page - 1) * limit;

    const where: Prisma.PartnerInvestmentWhereInput = {
      ...(params.type ? { type: params.type } : {}),
      ...(params.category ? { inventoryCategory: params.category } : {}),
      ...(params.partnerId ? { partnerId: params.partnerId } : {}),
      ...(params.status ? { status: params.status } : { status: "active" }),
      ...(params.country
        ? { country: { equals: params.country, mode: "insensitive" } }
        : {}),
      ...(params.city
        ? { city: { contains: params.city, mode: "insensitive" } }
        : {}),
    };

    const [investments, total] = await Promise.all([
      prisma.partnerInvestment.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
        include: {
          partner: {
            select: {
              id: true,
              name: true,
              username: true,
              imgId: true,
              roleType: true,
            },
          },
          targetVenue: {
            select: { id: true, name: true, city: true },
          },
          targetEvent: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.partnerInvestment.count({ where }),
    ]);

    return {
      investments,
      total,
      totalPages: totalPages(total, limit),
    };
  }

  // FIND FOR MAP VIEW (Bounding Box or Global Country View)
  static async findInvestmentsOnMap(params: {
    type?: InvestmentType;
    category?: InventoryCategory;
    country?: string;
    bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  }) {
    const where: Prisma.PartnerInvestmentWhereInput = {
      status: "active",
      lat: { not: null },
      lng: { not: null },
      ...(params.type ? { type: params.type } : {}),
      ...(params.category ? { inventoryCategory: params.category } : {}),
      ...(params.country
        ? { country: { equals: params.country, mode: "insensitive" } }
        : {}),
      ...(params.bounds
        ? {
            lat: { gte: params.bounds.minLat, lte: params.bounds.maxLat },
            lng: { gte: params.bounds.minLng, lte: params.bounds.maxLng },
          }
        : {}),
    };

    return prisma.partnerInvestment.findMany({
      where,
      take: 150,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        inventoryCategory: true,
        quantityTotal: true,
        quantityAvailable: true,
        itemCondition: true,
        monetaryValue: true,
        usageTerms: true,
        dailyRentalRate: true,
        address: true,
        city: true,
        state: true,
        country: true,
        lat: true,
        lng: true,
        deliveryRadiusKm: true,
        transportPolicy: true,
        mediaUrls: true,
        status: true,
        partner: {
          select: {
            id: true,
            name: true,
            username: true,
            imgId: true,
          },
        },
      },
    });
  }

  // FIND NEARBY INVENTORY (For a specific venue or event lat/lng)
  static async findNearbyInventory(params: {
    lat: number;
    lng: number;
    category?: InventoryCategory;
    maxRadiusKm?: number;
  }) {
    const maxRadius = params.maxRadiusKm || 50;

    // Fetch active physical inventory items with coordinates
    const items = await prisma.partnerInvestment.findMany({
      where: {
        type: "physical_inventory",
        status: "active",
        lat: { not: null },
        lng: { not: null },
        ...(params.category ? { inventoryCategory: params.category } : {}),
      },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            username: true,
            imgId: true,
          },
        },
      },
    });

    // Filter and score by Haversine distance
    const nearby = items
      .map((item) => {
        const distanceKm = calculateDistanceKm(
          params.lat,
          params.lng,
          item.lat!,
          item.lng!,
        );
        const withinDelivery =
          distanceKm <=
          (item.deliveryRadiusKm != null ? item.deliveryRadiusKm : maxRadius);
        return {
          ...item,
          distanceKm: Math.round(distanceKm * 10) / 10,
          withinDeliveryRadius: withinDelivery,
        };
      })
      .filter((item) => item.withinDeliveryRadius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return nearby;
  }

  // FIND ONE BY ID
  static async findById(id: string) {
    return prisma.partnerInvestment.findUnique({
      where: { id },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            username: true,
            imgId: true,
            city: true,
            country: true,
            roleType: true,
          },
        },
        targetVenue: {
          select: { id: true, name: true, city: true, address: true },
        },
        targetEvent: {
          select: { id: true, name: true, startAt: true },
        },
      },
    });
  }

  // UPDATE
  static async updateInvestment(
    id: string,
    data: Prisma.PartnerInvestmentUpdateInput,
  ) {
    return prisma.partnerInvestment.update({
      where: { id },
      data,
    });
  }

  // DELETE
  static async deleteInvestment(id: string) {
    return prisma.partnerInvestment.delete({
      where: { id },
    });
  }
}
