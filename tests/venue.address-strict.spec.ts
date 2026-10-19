import { describe, it, expect, vi } from "vitest";

/**
 * A published venue must carry a real address: a street and, in the
 * Philippines, a province → city/municipality → barangay chain from the PSGC
 * list. A draft can be saved half-filled.
 */

vi.mock("../src/utils/redis.util", () => ({
  default: { getClient: () => null },
}));

const createVenue = vi.hoisted(() => vi.fn(async (d: unknown) => d));
vi.mock("../src/modules/venue/venue.repository", () => ({
  default: { createVenue },
}));

import VenueSvc from "../src/modules/venue/venue.service";

const base = {
  mayorId: "m1",
  name: "Pine Hall",
  description: "",
  category: "outdoor",
  capacity: 50,
  price: 0,
  address: "12 Session Road",
  country: "Philippines",
  state: "Benguet",
  city: "City of Baguio",
  imgIds: ["img"],
} as never;

const venue = (over: Record<string, unknown>) =>
  ({ ...(base as object), ...over }) as never;

describe("venue address on publish", () => {
  it("rejects a barangay that is not in the chosen city", async () => {
    await expect(
      VenueSvc.createVenue(venue({ district: "Lahug", status: "pending" })),
    ).rejects.toThrow(/not a recognised barangay/);
  });

  it("rejects a Philippine venue with no barangay", async () => {
    await expect(
      VenueSvc.createVenue(venue({ status: "pending" })),
    ).rejects.toThrow(/barangay are required/);
  });

  it("rejects a venue with no street address", async () => {
    await expect(
      VenueSvc.createVenue(
        venue({ address: " ", district: "Ambiong", status: "pending" }),
      ),
    ).rejects.toThrow(/street address is required/);
  });

  it("lets a draft be saved without them", async () => {
    await VenueSvc.createVenue(venue({ status: "draft" }));
    expect(createVenue).toHaveBeenCalled();
  });
});
