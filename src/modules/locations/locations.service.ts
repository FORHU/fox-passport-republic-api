import { prisma } from "../../utils/prisma";

export default class LocationsSvc {
  // Returns distinct city names matching the query, sourced from User.city and
  // Venue.city. No external geocoding dependency.
  static async searchCities(q: string, limit = 8): Promise<string[]> {
    const query = q.trim();
    if (query.length < 2) return [];

    const [
      userCities,
      venueCities,
      templateCities,
      serviceCities,
      assetCities,
    ] = await Promise.all([
      prisma.user.findMany({
        where: {
          city: { not: null, contains: query, mode: "insensitive" },
        },
        distinct: ["city"],
        select: { city: true },
      }),
      prisma.venue.findMany({
        where: {
          city: { contains: query, mode: "insensitive" },
        },
        distinct: ["city"],
        select: { city: true },
      }),
      prisma.eventTemplate.findMany({
        where: {
          targetCity: { not: null, contains: query, mode: "insensitive" },
        },
        distinct: ["targetCity"],
        select: { targetCity: true },
      }),
      prisma.service.findMany({
        where: {
          city: { contains: query, mode: "insensitive" },
        },
        distinct: ["city"],
        select: { city: true },
      }),
      prisma.asset.findMany({
        where: {
          city: { contains: query, mode: "insensitive" },
        },
        distinct: ["city"],
        select: { city: true },
      }),
    ]);

    const seen = new Set<string>();
    const merged: string[] = [];

    for (const row of [
      ...userCities,
      ...venueCities,
      ...templateCities.map((r) => ({ city: r.targetCity })),
      ...serviceCities,
      ...assetCities,
    ]) {
      const city = row.city;
      if (!city) continue;
      const key = city.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(city);
    }

    const lower = query.toLowerCase();
    merged.sort((a, b) => {
      const aStarts = a.toLowerCase().startsWith(lower) ? 0 : 1;
      const bStarts = b.toLowerCase().startsWith(lower) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.localeCompare(b);
    });

    return merged.slice(0, limit);
  }
}
