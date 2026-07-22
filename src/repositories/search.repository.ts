import { prisma } from "../utils/prisma";
import { RoleType } from "@prisma/client";

export default class SearchRepo {
  // Aggregate discovery search: given a location (city) and optional category,
  // return event templates + gear foxers + service foxers (with their top items).
  static async searchByLocation(
    location?: string,
    category?: string,
    page = 1,
    limit = 30,
  ) {
    const skip = (page - 1) * limit;
    const cityFilter = location
      ? { contains: location, mode: "insensitive" as const }
      : undefined;

    const templateWhere = {
      isPublic: true,
      ...(cityFilter && { targetCity: cityFilter }),
      ...(category && { category: category as any }),
    };
    const gearFoxerWhere = {
      roleType: { has: "gearFoxer" as RoleType },
      ...(cityFilter && { city: cityFilter }),
    };
    const serviceFoxerWhere = {
      roleType: { has: "serviceFoxer" as RoleType },
      ...(cityFilter && { city: cityFilter }),
    };

    const [
      eventTemplates,
      gearFoxers,
      serviceFoxers,
      totalEventTemplates,
      totalGearFoxers,
      totalServiceFoxers,
    ] = await Promise.all([
      prisma.eventTemplate.findMany({
        where: templateWhere,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          images: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.user.findMany({
        where: gearFoxerWhere,
        select: {
          id: true,
          name: true,
          imgId: true,
          city: true,
          state: true,
          roleType: true,
          foxerSpecializations: {
            select: { roleType: true, category: true, source: true },
            orderBy: { source: "asc" },
          },
          assets: {
            where: {
              status: "available",
              deletedAt: null,
              ...(category ? { category: category as any } : {}),
            },
            take: 3,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              category: true,
              price: true,
              billingRate: true,
              images: { take: 1, select: { url: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.user.findMany({
        where: serviceFoxerWhere,
        select: {
          id: true,
          name: true,
          imgId: true,
          city: true,
          state: true,
          roleType: true,
          foxerSpecializations: {
            select: { roleType: true, category: true, source: true },
            orderBy: { source: "asc" },
          },
          services: {
            where: {
              status: "available",
              deletedAt: null,
              ...(category ? { category: category as any } : {}),
            },
            take: 3,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              category: true,
              price: true,
              billingRate: true,
              images: { take: 1, select: { url: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      prisma.eventTemplate.count({ where: templateWhere }),
      prisma.user.count({ where: gearFoxerWhere }),
      prisma.user.count({ where: serviceFoxerWhere }),
    ]);

    return {
      eventTemplates,
      gearFoxers,
      serviceFoxers,
      totalEventTemplates,
      totalGearFoxers,
      totalServiceFoxers,
    };
  }
}
