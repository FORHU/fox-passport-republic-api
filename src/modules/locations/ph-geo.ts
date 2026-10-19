import fs from "node:fs";
import path from "node:path";
import type { TBarangay, TMunCity, TProvince } from "@jobuntux/psgc";

/**
 * Philippine province → city/municipality → barangay, from the PSA's official
 * PSGC list (2025-2Q, via `@jobuntux/psgc`).
 *
 * `country-state-city` is wrong for the Philippines: it files Northern Mindanao
 * under Benguet and Baguio under a region code, so a mayor in Benguet could not
 * pick Baguio at all. Other countries still use it.
 *
 * Only the package's JSON is read: its JS entry point does not load in Node
 * (a directory import inside an ES module).
 *
 * The PSGC makes highly urbanised cities independent of any province. People
 * do not think of them that way, so they are listed under the province they
 * sit in, and the sixteen Metro Manila cities plus Pateros under "Metro Manila".
 */

const METRO_MANILA = { code: "NCR", name: "Metro Manila" };
const NCR_REGION = "13";

/** Highly urbanised city (by PSGC province code) → its geographic province. */
const HUC_PROVINCE: Record<string, string> = {
  "301": "Pampanga", // Angeles
  "302": "Negros Occidental", // Bacolod
  "303": "Benguet", // Baguio
  "304": "Agusan del Norte", // Butuan
  "305": "Misamis Oriental", // Cagayan de Oro
  "306": "Cebu", // Cebu City
  "307": "Davao del Sur", // Davao City
  "308": "South Cotabato", // General Santos
  "309": "Lanao del Norte", // Iligan
  "310": "Iloilo", // Iloilo City
  "311": "Cebu", // Lapu-Lapu
  "312": "Quezon", // Lucena
  "313": "Cebu", // Mandaue
  "314": "Zambales", // Olongapo
  "315": "Palawan", // Puerto Princesa
  "316": "Leyte", // Tacloban
  "317": "Zamboanga del Sur", // Zamboanga City
};

interface PhCity {
  name: string;
  /** Barangays are looked up by these PSGC codes. */
  munCityCode?: string;
  provCode?: string;
}

interface PhProvince {
  code: string;
  name: string;
  cities: PhCity[];
}

let index: Map<string, PhProvince> | null = null;
let barangays: TBarangay[] | null = null;

function read<T>(file: string): T {
  const root = path.dirname(require.resolve("@jobuntux/psgc/package.json"));
  return JSON.parse(
    fs.readFileSync(path.join(root, "data", "2025-2Q", file), "utf8"),
  ) as T;
}

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

function provinces(): Map<string, PhProvince> {
  if (index) return index;
  const provs = read<TProvince[]>("provinces.json");
  const muns = read<TMunCity[]>("muncities.json");

  const byCode = new Map<string, PhProvince>();
  const byName = new Map<string, PhProvince>();
  for (const p of provs) {
    if (p.cityClass || !p.provCode) continue;
    const prov = { code: p.provCode, name: p.provName.trim(), cities: [] };
    byCode.set(prov.code, prov);
    byName.set(prov.name.toLowerCase(), prov);
  }
  const ncr: PhProvince = { ...METRO_MANILA, cities: [] };
  byCode.set(ncr.code, ncr);

  for (const p of provs) {
    if (!p.cityClass || !p.provCode) continue;
    const home =
      p.regCode === NCR_REGION
        ? ncr
        : byName.get((HUC_PROVINCE[p.provCode] ?? "").toLowerCase());
    // A whole city: every barangay under its pseudo-province, which also
    // gathers Manila's, filed under its districts (Tondo, Sampaloc, ...).
    home?.cities.push({ name: p.provName.trim(), provCode: p.provCode });
  }
  for (const m of muns) {
    const prov = byCode.get(m.provCode);
    if (prov)
      prov.cities.push({
        name: m.munCityName.trim(),
        munCityCode: m.munCityCode,
      });
    else if (m.regCode === NCR_REGION && same(m.munCityName, "Pateros")) {
      ncr.cities.push({ name: "Pateros", munCityCode: m.munCityCode });
    }
  }
  for (const prov of byCode.values()) {
    prov.cities.sort((a, b) => a.name.localeCompare(b.name));
  }
  index = byCode;
  return index;
}

function findProvince(state: string): PhProvince | undefined {
  const all = provinces();
  return all.get(state) ?? [...all.values()].find((p) => same(p.name, state));
}

function findCity(state: string, city: string): PhCity | undefined {
  return findProvince(state)?.cities.find((c) => same(c.name, city));
}

export function phStates(): { code: string; name: string }[] {
  return [...provinces().values()]
    .map(({ code, name }) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A province's cities and municipalities — or the whole country's. */
export function phCities(state?: string): string[] {
  const provs = state
    ? [findProvince(state)].filter((p): p is PhProvince => !!p)
    : [...provinces().values()];
  return [...new Set(provs.flatMap((p) => p.cities.map((c) => c.name)))].sort(
    (a, b) => a.localeCompare(b),
  );
}

/** `state` is a province code or name; `city` a name from `phCities`. */
export function phBarangays(state: string, city: string): string[] {
  const place = findCity(state, city);
  if (!place) return [];
  barangays ??= read<TBarangay[]>("barangays.json");
  const rows = barangays.filter((b) =>
    place.munCityCode
      ? b.munCityCode === place.munCityCode
      : b.provCode === place.provCode,
  );
  return [...new Set(rows.map((b) => b.brgyName.trim()))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** The province holding a city with this name, when exactly one does. */
export function phProvinceOfCity(city: string): string | null {
  const strip = (n: string) =>
    n
      .toLowerCase()
      .replace(/^city of /, "")
      .replace(/ city$/, "")
      .trim();
  const target = strip(city);
  const hits = [...provinces().values()].filter((p) =>
    p.cities.some((c) => strip(c.name) === target),
  );
  return hits.length === 1 ? hits[0].name : null;
}

/**
 * Whether province → city → barangay is a real chain. Each level is checked
 * only when given; `district` must be one of the city's barangays.
 */
export function isPhAddress(
  state?: string,
  city?: string,
  district?: string,
): boolean {
  if (!state) return !city && !district;
  if (!findProvince(state)) return false;
  if (!city) return !district;
  if (!findCity(state, city)) return false;
  if (!district) return true;
  return phBarangays(state, city).some((b) => same(b, district));
}

export const isPhilippines = (country?: string | null) =>
  !!country && (same(country, "Philippines") || same(country, "PH"));
