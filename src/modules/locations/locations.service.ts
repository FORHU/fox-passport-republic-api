import { prisma } from "../../utils/prisma";
import { cached } from "../../utils/cache.util";
import { City, Country, State, type ICity } from "country-state-city";

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

/**
 * Country → state → city reference data for the cascading location pickers,
 * from the bundled `country-state-city` dataset — no geocoder, no token, the
 * same answer offline. Lists are static, so they're built once per process.
 */
export class GeoDirectory {
  private static countriesCache: GeoCountry[] | null = null;

  static countries(): GeoCountry[] {
    if (!this.countriesCache) {
      this.countriesCache = Country.getAllCountries()
        .map((c) => ({
          code: c.isoCode,
          name: c.name,
          flag: c.flag,
          phoneCode: c.phonecode,
          currency: c.currency,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return this.countriesCache;
  }

  static states(countryCode: string): GeoState[] {
    return State.getStatesOfCountry(countryCode.toUpperCase())
      .map((s) => ({ code: s.isoCode, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Cities of one state — or of the whole country when it has no states. */
  static cities(countryCode: string, stateCode?: string): string[] {
    const cc = countryCode.toUpperCase();
    const rows = stateCode
      ? City.getCitiesOfState(cc, stateCode)
      : (City.getCitiesOfCountry(cc) ?? []);
    return [...new Set(rows.map((c) => c.name))].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  /**
   * The dataset city closest to a point — how a browser's geolocation becomes
   * a pre-filled country / state / city. A linear scan over ~150k cities is a
   * few milliseconds, and it runs once per page that asks.
   */
  static nearest(lat: number, lng: number): GeoPlace | null {
    let best: { city: ICity; d: number } | null = null;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    for (const city of City.getAllCities()) {
      const cLat = Number(city.latitude);
      const cLng = Number(city.longitude);
      if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) continue;
      // Equirectangular distance — plenty for "which city is nearest".
      const dx = (cLng - lng) * cosLat;
      const dy = cLat - lat;
      const d = dx * dx + dy * dy;
      if (!best || d < best.d) best = { city, d };
    }
    if (!best) return null;
    const { city } = best;
    const state = State.getStateByCodeAndCountry(
      city.stateCode,
      city.countryCode,
    );
    return {
      countryCode: city.countryCode,
      stateCode: state ? city.stateCode : null,
      stateName: state?.name ?? null,
      city: city.name,
    };
  }
}

export interface GeoCountry {
  code: string;
  name: string;
  flag: string;
  phoneCode: string;
  currency: string;
}

export interface GeoState {
  code: string;
  name: string;
}

export interface GeoPlace {
  countryCode: string;
  stateCode: string | null;
  stateName: string | null;
  city: string;
}
