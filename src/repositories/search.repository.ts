import { prisma } from "../utils/prisma";
import { RoleType } from "@prisma/client";

export default class SearchRepo {
  // Aggregate discovery search: given a location (city) and optional category,
  // return event templates + gear foxers + service foxers (with their top items).
  static async searchByLocation(location?: string, category?: string) {
    const cityFilter = location
      ? { contains: location, mode: "insensitive" as const }
      : undefined;

    const [eventTemplates, gearFoxers, serviceFoxers] = await Promise.all([
      prisma.eventTemplate.findMany({
        where: {
          isPublic: true,
          ...(cityFilter && { targetCity: cityFilter }),
          ...(category && { category: category as any }),
        },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          images: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.user.findMany({
        where: {
          roleType: { has: "gearFoxer" as RoleType },
          ...(cityFilter && { city: cityFilter }),
        },
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
            where: { status: "available", deletedAt: null, ...(category ? { category: category as any } : {}) },
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
        take: 30,
      }),
      prisma.user.findMany({
        where: {
          roleType: { has: "serviceFoxer" as RoleType },
          ...(cityFilter && { city: cityFilter }),
        },
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
            where: { status: "available", deletedAt: null, ...(category ? { category: category as any } : {}) },
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
        take: 30,
      }),
    ]);

    return { eventTemplates, gearFoxers, serviceFoxers };
  }
}
