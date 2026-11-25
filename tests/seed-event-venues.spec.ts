import { describe, expect, it } from "vitest";
import { BULK_TEMPLATE_DEFS } from "../prisma/seeder/event.seeder";
import {
  BULK_EVENT_VENUES,
  EVENT_VENUES,
  PACKAGE_VENUE_MOVES,
  PACKAGE_VENUES,
} from "../prisma/seeder/event-venues";
import {
  SAMPLE_VENUE_IMAGES,
  SAMPLE_VENUES,
} from "../prisma/seeder/sample-venues";
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

  it("has every sample venue and its picture", () => {
    const names = SAMPLE_VENUES.map((v) => v.name);
    expect(SAMPLE_VENUE_IMAGES.map((i) => i.venueName)).toEqual(names);
    const ids = names.map(
      (n) => `seed-venue-${n.toLowerCase().replace(/\s+/g, "-")}`,
    );
    const used = new Set(Object.values(PACKAGE_VENUES));
    expect(ids.filter((id) => !used.has(id))).toEqual([]);
  });

  it("names only seeded venues", () => {
    const ids = [
      ...Object.values(PACKAGE_VENUES),
      ...Object.values(PACKAGE_VENUE_MOVES).flatMap((m) => [m.from, m.to]),
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
