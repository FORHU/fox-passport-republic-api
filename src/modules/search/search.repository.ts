import { prisma } from "../../utils/prisma";
import {
  AssetCategory,
  EventCategory,
  RoleType,
  ServiceCategory,
} from "@prisma/client";
import { toEnum } from "../../utils/enums";
import { PERFORMER_SERVICE_CATEGORIES } from "../../types/permissions";

export default class SearchRepo {
  // Aggregate discovery search: given a location (city) and optional category,
  // return event templates + Providers in three sections, gear, services and
  // performers, each with their top items of that kind. (The section keys
  // keep their legacy gearFoxers/serviceFoxers/performerFoxers names, which
  // web and mobile read.)
  static async searchByLocation(
    location?: string,
    category?: string,
    page = 1,
    limit = 30,
    specialty?: string,
  ) {
    const skip = (page - 1) * limit;
    const cityFilter = location
      ? { contains: location, mode: "insensitive" as const }
      : undefined;

    // The same `category` string is matched against three different enums
    // below, so it is narrowed separately for each.
    const eventCategory = toEnum(EventCategory, category);
    const assetCategory = toEnum(AssetCategory, category);
    const serviceCategory = toEnum(ServiceCategory, category);

    const templateWhere = {
      isPublic: true,
      ...(cityFilter && { targetCity: cityFilter }),
      ...(eventCategory && { category: eventCategory }),
    };
    // A Provider is found under each specialty they declared, on its own.
    const specialtyWhere = specialty
      ? {
          foxerSpecializations: {
            some: { roleType: RoleType.providerFoxer, category: specialty },
          },
        }
      : {};
    const gearFoxerWhere = {
      roleType: { has: RoleType.providerFoxer },
      ...(cityFilter && { city: cityFilter }),
      ...specialtyWhere,
    };
    const serviceFoxerWhere = {
      roleType: { has: RoleType.providerFoxer },
      ...(cityFilter && { city: cityFilter }),
      ...specialtyWhere,
    };
    const performerFoxerWhere = {
      roleType: { has: RoleType.providerFoxer },
      ...(cityFilter && { city: cityFilter }),
      ...specialtyWhere,
    };
    // A performer-category `category` param narrows the performer section to
    // that specific category; otherwise it shows the full performer set.
    const performerListingCategory =
      serviceCategory && PERFORMER_SERVICE_CATEGORIES.includes(serviceCategory)
        ? serviceCategory
        : undefined;

    const [
      eventTemplates,
      gearFoxers,
      serviceFoxers,
      performerFoxers,
      totalEventTemplates,
      totalGearFoxers,
      totalServiceFoxers,
      totalPerformerFoxers,
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
              ...(assetCategory && { category: assetCategory }),
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
              ...(serviceCategory && { category: serviceCategory }),
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
        where: performerFoxerWhere,
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
              category: performerListingCategory
                ? performerListingCategory
                : { in: [...PERFORMER_SERVICE_CATEGORIES] },
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
      prisma.user.count({ where: performerFoxerWhere }),
    ]);

    return {
      eventTemplates,
      gearFoxers,
      serviceFoxers,
      performerFoxers,
      totalEventTemplates,
      totalGearFoxers,
      totalServiceFoxers,
      totalPerformerFoxers,
    };
  }
}
