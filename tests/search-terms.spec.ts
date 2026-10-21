import { describe, it, expect } from "vitest";
import { cityNeedle, eventCategoriesMatching } from "../src/utils/search-terms";

/**
 * The /search city filter and search box found nothing for cities written the
 * way the pickers write them ("City of Makati", a full Mapbox place name) and
 * nothing at all for event types. These pin the terms the filters match on.
 */

describe("cityNeedle", () => {
  it("drops the PSGC 'City of' prefix and a trailing 'City'", () => {
    expect(cityNeedle("City of Makati")).toBe("Makati");
    expect(cityNeedle("city of manila")).toBe("manila");
    expect(cityNeedle("Makati City")).toBe("Makati");
    expect(cityNeedle("Quezon City")).toBe("Quezon");
  });

  it("keeps only the first segment of a full place name", () => {
    expect(cityNeedle("Makati, Metro Manila, Philippines")).toBe("Makati");
    expect(cityNeedle("City of Taguig, Metro Manila")).toBe("Taguig");
  });

  it("leaves plain names alone", () => {
    expect(cityNeedle("Pasig")).toBe("Pasig");
    expect(cityNeedle("  Cebu  ")).toBe("Cebu");
  });

  it("returns undefined for blank or non-string input", () => {
    expect(cityNeedle("")).toBeUndefined();
    expect(cityNeedle("   ")).toBeUndefined();
    expect(cityNeedle(", Philippines")).toBeUndefined();
    expect(cityNeedle(undefined)).toBeUndefined();
    expect(cityNeedle(["Makati"])).toBeUndefined();
  });
});

describe("eventCategoriesMatching", () => {
  it("finds the category inside a longer phrase", () => {
    expect(eventCategoriesMatching("weddings")).toEqual(["wedding"]);
    expect(eventCategoriesMatching("Corporate party")).toEqual(["corporate"]);
  });

  it("finds the category from a prefix of three or more letters", () => {
    expect(eventCategoriesMatching("birth")).toEqual(["birthday"]);
    expect(eventCategoriesMatching("corp")).toEqual(["corporate"]);
  });

  it("ignores short terms, unrelated words and the catch-all 'other'", () => {
    expect(eventCategoriesMatching("so")).toEqual([]);
    expect(eventCategoriesMatching("")).toEqual([]);
    expect(eventCategoriesMatching("Makati")).toEqual([]);
    expect(eventCategoriesMatching("mother")).toEqual([]);
    expect(eventCategoriesMatching(undefined)).toEqual([]);
  });
});
