import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A citizen's public profile is readable by anyone and can be indexed, so its
 * venue stamps show the venue and city only. The event's name, date, photo and
 * free-text location, and the stamp's own createdAt, would make them a dated
 * record of where the person was; the person themselves still sees them.
 */

const repo = vi.hoisted(() => ({ findPublicCitizenProfile: vi.fn() }));
vi.mock("../src/modules/users/users.repository", () => ({ default: repo }));
vi.mock("../src/utils/cache-namespaces", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  userCache: {
    cached: (_key: string, _ttl: number, fn: () => unknown) => fn(),
  },
}));

import UsersSvc from "../src/modules/users/users.service";

const STAMP = {
  id: "s1",
  eventName: "Ivan's wedding",
  eventDate: new Date("2027-06-12T00:00:00Z"),
  location: "12 Mabini St",
  imageUrl: "https://example.com/wedding.jpg",
  xpEarned: 50,
  createdAt: new Date("2027-06-12T22:00:00Z"),
  venueId: "v1",
  venue: { id: "v1", name: "Sky Hall", city: "Cebu" },
};

beforeEach(() => {
  repo.findPublicCitizenProfile.mockResolvedValue({
    id: "ana",
    name: "Ana",
    passport: { id: "p1", stamps: [structuredClone(STAMP)] },
  });
});

describe("UsersSvc.getPublicProfile", () => {
  it("shows others the venue and city of a stamp, not the event", async () => {
    for (const viewer of [undefined, "someone-else"]) {
      const profile = await UsersSvc.getPublicProfile("ana", viewer);
      const [stamp] = profile.passport!.stamps;
      expect(stamp).toEqual({
        id: "s1",
        xpEarned: 50,
        venueId: "v1",
        venue: { id: "v1", name: "Sky Hall", city: "Cebu" },
      });
    }
  });

  it("shows the person their own stamps in full", async () => {
    const profile = await UsersSvc.getPublicProfile("ana", "ana");
    expect(profile.passport!.stamps[0]).toMatchObject({
      eventName: "Ivan's wedding",
      location: "12 Mabini St",
    });
  });

  it("is a not-found for an unknown citizen", async () => {
    repo.findPublicCitizenProfile.mockResolvedValue(null);
    await expect(UsersSvc.getPublicProfile("nobody")).rejects.toThrow(
      /not found/,
    );
  });
});
