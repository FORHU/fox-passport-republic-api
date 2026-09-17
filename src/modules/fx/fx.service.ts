import axios from "axios";

interface RateSnapshot {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
}

// A handful of currencies the UI offers in its picker. The upstream API
// actually returns far more, but scoping the response keeps the payload (and
// the dropdown) small and deliberate rather than dumping ~170 codes on it.
export const SUPPORTED_CURRENCIES = [
  "PHP",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "SGD",
  "CAD",
  "HKD",
  "KRW",
] as const;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — FX rates don't need to be live-live
const cache = new Map<string, RateSnapshot>();

export default class FxSvc {
  /**
   * Rates are for display conversion only — nothing in the app charges or
   * settles in a converted amount, so an occasional stale rate here is a
   * cosmetic risk, not a financial one. That's what justifies both the long
   * TTL and falling back to a stale cache entry (rather than erroring out)
   * if the upstream API is briefly unreachable.
   */
  static async getRates(base: string): Promise<RateSnapshot> {
    const normalizedBase = base.toUpperCase();
    const cached = cache.get(normalizedBase);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached;
    }

    try {
      const resp = await axios.get(
        `https://open.er-api.com/v6/latest/${normalizedBase}`,
        { timeout: 5000 },
      );
      if (resp.data?.result !== "success" || !resp.data?.rates) {
        throw new Error("Unexpected FX API response shape");
      }

      const rates: Record<string, number> = {};
      for (const code of SUPPORTED_CURRENCIES) {
        if (typeof resp.data.rates[code] === "number") {
          rates[code] = resp.data.rates[code];
        }
      }
      rates[normalizedBase] = 1;

      const snapshot: RateSnapshot = {
        base: normalizedBase,
        rates,
        fetchedAt: Date.now(),
      };
      cache.set(normalizedBase, snapshot);
      return snapshot;
    } catch (e) {
      if (cached) return cached; // stale but usable
      throw e;
    }
  }
}
