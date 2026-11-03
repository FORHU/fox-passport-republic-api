import { prisma } from "../../utils/prisma";
import { cached } from "../../utils/cache.util";
import { City, Country, State, type ICity } from "country-state-city";
import { phoneCallingCode } from "../../utils/phone";
import { phCities, phProvinceOfCity, phStates } from "./ph-geo";
import { CITY_EXTRAS } from "./city-extras";
import { VenueStatus } from "@prisma/client";

export default class LocationsSvc {
  /**
   * A state's cities (or a stateless country's): the dataset's, plus the
   * hand-added `CITY_EXTRAS`, plus every city an approved venue there uses.
   *
   * The dataset has gaps - 1,461 states with no cities at all - so a city a
   * mayor had to type in joins the list once an admin approves their venue.
   * Approved only, so a typo in a draft never spreads to everyone else.
   * The Philippines is left alone: its PSGC list is complete and strict.
   */
  static async cities(countryCode: string, stateCode?: string) {
    const cc = countryCode.toUpperCase();
    const listed = GeoDirectory.cities(cc, stateCode);
    if (cc === "PH") return listed;

    const country = Country.getCountryByCode(cc)?.name;
    const state = stateCode
      ? State.getStateByCodeAndCountry(stateCode, cc)?.name
      : undefined;
    const extras = Object.entries(CITY_EXTRAS[cc] ?? {})
      .filter(([s]) => !stateCode || s === state)
      .flatMap(([, list]) => list);
    const learned = country
      ? await cached(`learned-cities:${cc}:${stateCode ?? ""}`, 10 * 60, () =>
          prisma.venue
            .findMany({
              where: {
                status: VenueStatus.available,
                country: { equals: country, mode: "insensitive" },
                ...(state && {
                  state: { equals: state, mode: "insensitive" },
                }),
              },
              distinct: ["city"],
              select: { city: true },
            })
            .then((rows) => rows.map((r) => r.city.trim()).filter(Boolean)),
        ).catch(() => [] as string[]) // a lookup aid: never fail the list
      : [];

    // First spelling wins, so a learned "manila" never shadows "Manila".
    const merged = new Map<string, string>();
    for (const name of [...listed, ...extras, ...learned]) {
      if (!merged.has(name.toLowerCase())) merged.set(name.toLowerCase(), name);
    }
    return [...merged.values()].sort((a, b) => a.localeCompare(b));
  }

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
/**
 * States whose cities the dataset files under another state's code, as
 * `{ country: { realState: codeTheCitiesUse } }`. Northern Ireland's towns
 * (Belfast, Derry, Antrim, ...) sit under NYK, North Yorkshire, whose own
 * towns are filed under England.
 */
const MISFILED: Record<string, Record<string, string>> = {
  GB: { NIR: "NYK" },
};

/** The code a state's cities are really filed under, or null for a code that
 * only holds another state's misfiled cities. */
function cityStateCode(cc: string, stateCode: string): string | null {
  const fixes = MISFILED[cc] ?? {};
  if (fixes[stateCode]) return fixes[stateCode];
  return Object.values(fixes).includes(stateCode) ? null : stateCode;
}

export class GeoDirectory {
  private static countriesCache: GeoCountry[] | null = null;

  static countries(): GeoCountry[] {
    if (!this.countriesCache) {
      this.countriesCache = Country.getAllCountries()
        .map((c) => ({
          code: c.isoCode,
          name: c.name,
          flag: c.flag,
          // libphonenumber's calling code, not the dataset's: that one reads
          // "+1-809 and 1-829" for some countries. "" where a territory has
          // no phone numbering (Antarctica, Bouvet Island, ...).
          phoneCode: phoneCallingCode(c.isoCode),
          currency: c.currency,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return this.countriesCache;
  }

  private static statesCache = new Map<string, GeoState[]>();

  /**
   * A country's states - only those that have cities, when any do.
   *
   * The dataset often lists two levels side by side: the UK's four nations
   * hold all 3,871 of its cities while its 243 counties hold none, France's
   * regions hold them and its departments don't. Picking an empty one left
   * the city list empty, so most cities could not be reached. A country with
   * no cities at all keeps every state; its city is suggested or typed.
   */
  static states(countryCode: string): GeoState[] {
    const cc = countryCode.toUpperCase();
    if (cc === "PH") return phStates();
    const hit = this.statesCache.get(cc);
    if (hit) return hit;
    const all = State.getStatesOfCountry(cc)
      .map((s) => ({ code: s.isoCode, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const withCities = new Set(
      (City.getCitiesOfCountry(cc) ?? []).map((c) => c.stateCode),
    );
    const useful = all.filter((s) => {
      const code = cityStateCode(cc, s.code);
      return code !== null && withCities.has(code);
    });
    const result = useful.length ? useful : all;
    this.statesCache.set(cc, result);
    return result;
  }

  /** Cities of one state — or of the whole country when it has no states. */
  static cities(countryCode: string, stateCode?: string): string[] {
    const cc = countryCode.toUpperCase();
    if (cc === "PH") return phCities(stateCode);
    const filedUnder = stateCode ? cityStateCode(cc, stateCode) : undefined;
    if (filedUnder === null) return [];
    const rows = filedUnder
      ? City.getCitiesOfState(cc, filedUnder)
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
    if (city.countryCode === "PH") {
      // Its own state codes are wrong here; place the city in the PSGC list.
      const province = phProvinceOfCity(city.name);
      const name = province
        ? (phCities(province).find(
            (c) =>
              c.toLowerCase().replace(/^city of /, "") ===
              city.name.toLowerCase(),
          ) ?? city.name)
        : city.name;
      return {
        countryCode: "PH",
        stateCode: province
          ? (phStates().find((s) => s.name === province)?.code ?? null)
          : null,
        stateName: province,
        city: name,
      };
    }
    // Undo a misfiling: Belfast is under NYK in the data, NIR in fact.
    const realCode =
      Object.entries(MISFILED[city.countryCode] ?? {}).find(
        ([, filed]) => filed === city.stateCode,
      )?.[0] ?? city.stateCode;
    const state = State.getStateByCodeAndCountry(realCode, city.countryCode);
    return {
      countryCode: city.countryCode,
      stateCode: state ? realCode : null,
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
