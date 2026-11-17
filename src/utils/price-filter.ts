import { PRICE_MAX } from "./limits";

/**
 * A `maxPrice` filter as the browse endpoints use it: a finite number above 0,
 * capped at PRICE_MAX (the highest price a listing can have). Anything else —
 * blank, negative, `abc`, `1e400`, an array from `?maxPrice=1&maxPrice=2` — is
 * no filter at all, so a bad link shows unfiltered results instead of a 500.
 */
export function maxPriceFilter(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.min(value, PRICE_MAX);
}
