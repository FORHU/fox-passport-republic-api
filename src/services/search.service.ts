import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";

export const performSearch = async (filters: any) => {
  const { type, q, country, city, category, page, limit, sortBy, sortOrder } = filters;

  const skip = (page - 1) * limit;
  const take = limit;

  let where: any = {};

  // Apply location filters
  if (country) {
    if (type === "event_template") {
      where.targetCountry = { equals: country, mode: 'insensitive' };
    } else {
      where.country = { equals: country, mode: 'insensitive' };
    }
  }

  if (city) {
    if (type === "event_template") {
      where.targetCity = { equals: city, mode: 'insensitive' };
    } else {
      where.city = { equals: city, mode: 'insensitive' };
    }
  }

  // Apply Full Text Search
  if (q) {
    // Basic formatting for Postgres FTS, falling back to contains if simple
    const formattedQuery = q.trim().split(/\s+/).join(' | ');
    where.OR = [
      { name: { search: formattedQuery } },
      { description: { search: formattedQuery } },
      { name: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Apply category
  if (category) {
    where.category = category;
  }
  
  // Exclude draft/archived items where applicable
  if (type !== "event_template") {
     where.status = { notIn: ["draft", "archived", "rejected"] };
  } else {
     where.isPublic = true;
  }

  let results = [];
  let total = 0;

  switch (type) {
    case "event_template":
      [results, total] = await prisma.$transaction([
        prisma.eventTemplate.findMany({
          where, skip, take, orderBy: { [sortBy as string]: sortOrder },
          include: { images: true }
        }),
        prisma.eventTemplate.count({ where })
      ]);
      break;

    case "service":
      [results, total] = await prisma.$transaction([
        prisma.service.findMany({
          where, skip, take, orderBy: { [sortBy as string]: sortOrder },
          include: { images: true }
        }),
        prisma.service.count({ where })
      ]);
      break;

    case "asset":
      [results, total] = await prisma.$transaction([
        prisma.asset.findMany({
          where, skip, take, orderBy: { [sortBy as string]: sortOrder },
          include: { images: true }
        }),
        prisma.asset.count({ where })
      ]);
      break;

    case "venue":
      [results, total] = await prisma.$transaction([
        prisma.venue.findMany({
          where, skip, take, orderBy: { [sortBy as string]: sortOrder },
          include: { images: true }
        }),
        prisma.venue.count({ where })
      ]);
      break;

    case "pros": {
      const takeFraction = Math.ceil(take / 3);
      const [venues, vCount, services, sCount, assets, aCount] = await prisma.$transaction([
        prisma.venue.findMany({ where, skip, take: takeFraction, orderBy: { [sortBy as string]: sortOrder }, include: { images: true } }),
        prisma.venue.count({ where }),
        prisma.service.findMany({ where, skip, take: takeFraction, orderBy: { [sortBy as string]: sortOrder }, include: { images: true } }),
        prisma.service.count({ where }),
        prisma.asset.findMany({ where, skip, take: takeFraction, orderBy: { [sortBy as string]: sortOrder }, include: { images: true } }),
        prisma.asset.count({ where })
      ]);
      
      results = [...venues, ...services, ...assets];
      total = vCount + sCount + aCount;
      break;
    }
      
    default:
      throw new Error("Invalid search type");
  }

  return {
    results,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};
