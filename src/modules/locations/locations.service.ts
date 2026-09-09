import { prisma } from "../../utils/prisma";
import { cached } from "../../utils/cache.util";

export default class LocationsSvc {
  /**
   * Distinct city names matching the query, sourced from the cities already in
   * the data rather than from any external geocoder.
   *
   * Five `distinct` scans with case-insensitive `contains`, across five tables,
   * on a typeahead - so it runs on every keystroke and the pattern match cannot
   * use an ordinary index. The same prefix always yields the same list, and the
   * set of cities people are in changes on the order of days.
   *
   * Keyed on the normalised query and the limit, so two callers typing "mak"
   * share a fill. Ten minutes: long enough to cover a burst of typing across
   * many users, short enough that a genuinely new city appears the same day.
   */
  static async searchCities(q: string, limit = 8): Promise<string[]> {
    const query = q.trim();
    if (query.length < 2) return [];

    return cached(`cities:${query.toLowerCase()}:${limit}`, 10 * 60, () =>
      this.computeCitySearch(query, limit),
    );
  }

  private static async computeCitySearch(
    query: string,
    limit: number,
  ): Promise<string[]> {
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
