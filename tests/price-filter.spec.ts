import { describe, it, expect } from "vitest";
import { maxPriceFilter } from "../src/utils/price-filter";
import { PRICE_MAX } from "../src/utils/limits";

/**
 * app#286: the /search Max Price filter reached Prisma as `Number(maxPrice)`,
 * so `abc` or `1e400` failed the browse endpoints and a negative value
 * silently matched nothing. These pin what the endpoints accept.
 */
describe("maxPriceFilter", () => {
  it("keeps a valid price, decimals included", () => {
    expect(maxPriceFilter("2500")).toBe(2500);
    expect(maxPriceFilter("1499.5")).toBe(1499.5);
    expect(maxPriceFilter(" 800 ")).toBe(800);
  });

  it("caps a price above the listing limit", () => {
    expect(maxPriceFilter("99999999999")).toBe(PRICE_MAX);
    expect(maxPriceFilter(String(PRICE_MAX))).toBe(PRICE_MAX);
  });

  it("ignores zero, negative and non-numeric values", () => {
    expect(maxPriceFilter("0")).toBeUndefined();
    expect(maxPriceFilter("-5")).toBeUndefined();
    expect(maxPriceFilter("abc")).toBeUndefined();
    expect(maxPriceFilter("12abc")).toBeUndefined();
    expect(maxPriceFilter("1e400")).toBeUndefined();
    expect(maxPriceFilter("Infinity")).toBeUndefined();
  });

  it("ignores blank and non-string values", () => {
    expect(maxPriceFilter("")).toBeUndefined();
    expect(maxPriceFilter("   ")).toBeUndefined();
    expect(maxPriceFilter(undefined)).toBeUndefined();
    expect(maxPriceFilter(["100", "200"])).toBeUndefined();
    expect(maxPriceFilter({ lte: "1" })).toBeUndefined();
  });
});
