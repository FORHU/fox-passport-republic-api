import { describe, it, expect } from "vitest";
import {
  isPhAddress,
  phBarangays,
  phCities,
  phProvinceOfCity,
  phStates,
} from "../src/modules/locations/ph-geo";

/**
 * `country-state-city` filed Northern Mindanao under Benguet and left Baguio
 * out of it. These pin the PSGC replacement to the places a mayor will look.
 */

describe("Philippine locations (PSGC)", () => {
  it("lists Baguio under Benguet, not Mindanao towns", () => {
    const benguet = phCities("Benguet");
    expect(benguet).toContain("City of Baguio");
    expect(benguet).toContain("La Trinidad");
    expect(benguet).not.toContain("Cagayan de Oro");
    expect(benguet).not.toContain("Little Baguio");
  });

  it("groups the Metro Manila cities and Pateros", () => {
    expect(phStates()).toContainEqual({ code: "NCR", name: "Metro Manila" });
    const ncr = phCities("NCR");
    expect(ncr).toHaveLength(17);
    expect(ncr).toEqual(expect.arrayContaining(["Quezon City", "Pateros"]));
  });

  it("returns a city's barangays, including Manila's under its districts", () => {
    expect(phBarangays("Benguet", "City of Baguio")).toHaveLength(129);
    expect(phBarangays("Metro Manila", "City of Manila").length).toBe(897);
  });

  it("accepts only a real province → city → barangay chain", () => {
    expect(isPhAddress("Benguet", "City of Baguio", "Ambiong")).toBe(true);
    expect(isPhAddress("benguet", "city of baguio", "ambiong")).toBe(true);
    expect(isPhAddress("Benguet", "Little Baguio")).toBe(false);
    expect(isPhAddress("Benguet", "City of Baguio", "Not A Barangay")).toBe(
      false,
    );
    expect(isPhAddress("Cebu", "City of Baguio", "Ambiong")).toBe(false);
  });

  it("places a city found by name in its province", () => {
    expect(phProvinceOfCity("Baguio")).toBe("Benguet");
  });
});
