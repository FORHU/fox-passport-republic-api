import { describe, expect, it } from "vitest";
import { buildGlobeStressEventData } from "../prisma/seeder/globe-stress.seeder";

describe("globe stress event fixtures", () => {
  it("creates repeatable global listings with dense events per city", () => {
    const events = buildGlobeStressEventData("test-owner");
    const cities = new Map<string, typeof events>();
    for (const event of events) {
      const cityEvents = cities.get(event.targetCity) ?? [];
      cityEvents.push(event);
      cities.set(event.targetCity, cityEvents);
    }

    expect(events).toHaveLength(240);
    expect(new Set(events.map((event) => event.id)).size).toBe(240);
    expect(
      events.every((event) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          event.id,
        ),
      ),
    ).toBe(true);
    expect(cities.size).toBe(24);
    expect(new Set(events.map((event) => event.targetCountry)).size).toBe(24);
    expect(
      [...cities.values()].every((cityEvents) => cityEvents.length === 10),
    ).toBe(true);
    expect(events.every((event) => event.ownerId === "test-owner")).toBe(true);
    expect(
      events.every(
        (event) =>
          event.isPublic &&
          event.status === "published" &&
          event.name.includes("Globe Load Test") &&
          typeof event.lat === "number" &&
          typeof event.lng === "number",
      ),
    ).toBe(true);
  });
});
