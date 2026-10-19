import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The dataset has gaps, so a city list is the dataset's plus the hand-added
 * extras plus the cities of approved venues. The Philippines keeps its strict
 * PSGC list.
 */

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => null },
}));

const findMany = vi.hoisted(() => vi.fn());
vi.mock("../src/utils/prisma", () => ({
  prisma: { venue: { findMany } },
}));

import LocationsSvc from "../src/modules/locations/locations.service";

beforeEach(() => {
  findMany.mockReset();
  findMany.mockResolvedValue([]);
});

describe("LocationsSvc.cities", () => {
  it("adds the hand-maintained extras where the dataset has none", async () => {
    const macau = await LocationsSvc.cities("MO");
    expect(macau).toEqual(expect.arrayContaining(["Taipa", "Coloane"]));
  });

  it("adds a city from an approved venue, asking for approved ones only", async () => {
    findMany.mockResolvedValue([{ city: "Vlasim" }]);
    const czState = "201"; // Benešov: no cities in the dataset
    expect(await LocationsSvc.cities("CZ", czState)).toContain("Vlasim");
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      status: "available",
      country: { equals: "Czech Republic" },
      state: { equals: "Benešov" },
    });
  });

  it("keeps one spelling when a learned city repeats a listed one", async () => {
    findMany.mockResolvedValue([{ city: "brooklyn" }]);
    const ny = await LocationsSvc.cities("US", "NY");
    expect(ny.filter((c) => c.toLowerCase() === "brooklyn")).toEqual([
      "Brooklyn",
    ]);
  });

  it("leaves the Philippines to the PSGC list", async () => {
    findMany.mockResolvedValue([{ city: "Little Baguio" }]);
    const benguet = await LocationsSvc.cities("PH", "011");
    expect(benguet).not.toContain("Little Baguio");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("still answers when the venue lookup fails", async () => {
    findMany.mockRejectedValue(new Error("db down"));
    expect(await LocationsSvc.cities("US", "NY")).toContain("Brooklyn");
  });
});
