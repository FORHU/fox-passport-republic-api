import { describe, expect, it } from "vitest";
import { BULK_TEMPLATE_DEFS } from "../prisma/seeder/event.seeder";
import {
  BULK_EVENT_VENUES,
  EVENT_VENUES,
  PACKAGE_VENUES,
} from "../prisma/seeder/event-venues";
import {
  buildGlobeStressEventData,
  buildGlobeStressVenueData,
} from "../prisma/seeder/globe-stress.seeder";

/** Seeded packages and events have a venue (api#480). */
describe("seed venues", () => {
  it("names a venue for every bulk package", () => {
    const missing = BULK_TEMPLATE_DEFS.map(
      (t) => `seed-template-bulk-${t.suffix}`,
    ).filter((id) => !PACKAGE_VENUES[id]);
    expect(missing).toEqual([]);
  });

  it("names only seeded venues", () => {
    const ids = [
      ...Object.values(PACKAGE_VENUES),
      ...Object.values(EVENT_VENUES).map((e) => e.venueId),
      ...Object.values(BULK_EVENT_VENUES),
    ];
    expect(ids.filter((id) => !id.startsWith("seed-venue-"))).toEqual([]);
  });

  it("has a venue in the city of every globe stress package", () => {
    const cities = new Set(buildGlobeStressVenueData("m").map((v) => v.city));
    const missing = buildGlobeStressEventData("o").filter(
      (t) => !cities.has(t.targetCity),
    );
    expect(missing).toEqual([]);
    expect(cities.size).toBe(24);
  });
});
