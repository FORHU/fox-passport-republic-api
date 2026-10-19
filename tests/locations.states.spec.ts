import { describe, it, expect } from "vitest";
import { GeoDirectory } from "../src/modules/locations/locations.service";

/**
 * The dataset lists two levels of "state" side by side and files cities under
 * only one, so picking the other left an empty city list. Only states with
 * cities are offered now, where a country has any.
 */
describe("GeoDirectory.states", () => {
  it("offers only the states that hold cities", () => {
    expect(GeoDirectory.states("GB").map((s) => s.name)).toEqual([
      "England",
      "Northern Ireland",
      "Scotland",
      "Wales",
    ]);
    expect(GeoDirectory.states("FR")).toHaveLength(13);
    for (const cc of ["GB", "FR", "IT", "CZ", "US"]) {
      for (const s of GeoDirectory.states(cc)) {
        expect(GeoDirectory.cities(cc, s.code).length, s.name).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("puts Northern Ireland's towns under it, not North Yorkshire", () => {
    expect(GeoDirectory.cities("GB", "NIR")).toContain("Belfast");
    expect(GeoDirectory.cities("GB", "NYK")).toEqual([]);
    expect(GeoDirectory.nearest(54.597, -5.93)?.stateName).toBe(
      "Northern Ireland",
    );
  });

  it("keeps every state where the country has no cities at all", () => {
    expect(GeoDirectory.states("XK").length).toBeGreaterThan(0);
  });
});
