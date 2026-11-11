import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RR-3 (api#300) I3: a Provider is found under each specialty they declared,
 * on its own, and Provider results carry `specialties: [{ slug, name }]`.
 * Prisma is stubbed; the where-clauses and the response shape are what is
 * under test.
 */

const prisma = vi.hoisted(() => ({
  eventTemplate: {
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  },
  user: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
  category: {
    findMany: vi.fn(async () => [
      { slug: "photography", name: "Photography" },
      { slug: "videography", name: "Videography" },
      { slug: "drone_photography", name: "Drone photography" },
    ]),
  },
}));
vi.mock("../src/utils/prisma", () => ({ prisma }));
vi.mock("../src/utils/cache.util", () => ({
  cached: (_key: string, _ttl: number, fn: () => unknown) => fn(),
  fingerprint: (v: unknown) => JSON.stringify(v),
  invalidate: vi.fn(async () => {}),
}));

const { default: SearchRepo } =
  await import("../src/modules/search/search.repository");
const { default: ProviderSpecialtySvc } =
  await import("../src/modules/users/provider-specialty.service");

beforeEach(() => vi.clearAllMocks());

const ownSpecialty = (category: string) => ({
  foxerSpecializations: {
    some: { roleType: "providerFoxer", category },
  },
});

describe("SearchRepo.searchByLocation with a specialty", () => {
  it("narrows every Provider section and its count to that specialty", async () => {
    await SearchRepo.searchByLocation(
      undefined,
      undefined,
      1,
      30,
      "photography",
    );

    const lists = prisma.user.findMany.mock.calls.map(
      (c) => (c as unknown as [{ where: object }])[0].where,
    );
    const counts = prisma.user.count.mock.calls.map(
      (c) => (c as unknown as [{ where: object }])[0].where,
    );
    expect(lists).toHaveLength(3);
    expect(counts).toHaveLength(3);
    for (const where of [...lists, ...counts]) {
      expect(where).toMatchObject(ownSpecialty("photography"));
    }
  });

  it("finds the same Provider under a second specialty on its own", async () => {
    await SearchRepo.searchByLocation(
      undefined,
      undefined,
      1,
      30,
      "videography",
    );
    const { where } = prisma.user.findMany.mock.calls[0][0] as unknown as {
      where: object;
    };
    expect(where).toMatchObject(ownSpecialty("videography"));
  });

  it("adds no specialty clause without one", async () => {
    await SearchRepo.searchByLocation();
    for (const call of prisma.user.findMany.mock.calls) {
      const { where } = call[0] as unknown as { where: object };
      expect(where).not.toHaveProperty("foxerSpecializations");
    }
  });
});

describe("ProviderSpecialtySvc.attach", () => {
  it("lists a Provider's specialties with their catalog names", async () => {
    const [provider] = await ProviderSpecialtySvc.attach([
      {
        id: "p1",
        roleType: ["providerFoxer"],
        foxerSpecializations: [
          { roleType: "providerFoxer", category: "photography" },
          { roleType: "providerFoxer", category: "videography" },
          { roleType: "providerFoxer", category: "drone_photography" },
        ],
      },
    ]);
    expect(provider.specialties).toEqual([
      { slug: "photography", name: "Photography" },
      { slug: "videography", name: "Videography" },
      { slug: "drone_photography", name: "Drone photography" },
    ]);
  });

  it("keeps each specialty once and ignores other roles' specializations", async () => {
    const [user] = await ProviderSpecialtySvc.attach([
      {
        roleType: ["providerFoxer", "venueFoxer"],
        foxerSpecializations: [
          { roleType: "providerFoxer", category: "photography" },
          { roleType: "providerFoxer", category: "photography" },
          { roleType: "venueFoxer", category: "wedding" },
        ],
      },
    ]);
    expect(user.specialties).toEqual([
      { slug: "photography", name: "Photography" },
    ]);
  });

  it("names a slug with no catalog row by the slug itself", async () => {
    const [user] = await ProviderSpecialtySvc.attach([
      {
        roleType: ["providerFoxer"],
        foxerSpecializations: [{ roleType: "providerFoxer", category: "mc" }],
      },
    ]);
    expect(user.specialties).toEqual([{ slug: "mc", name: "mc" }]);
  });

  it("gives a Provider with none an empty list", async () => {
    const [user] = await ProviderSpecialtySvc.attach([
      { roleType: ["providerFoxer"], foxerSpecializations: [] },
    ]);
    expect(user.specialties).toEqual([]);
  });

  it("returns someone who is not a Provider as they were", async () => {
    const venue = {
      roleType: ["venueFoxer"],
      foxerSpecializations: [{ roleType: "venueFoxer", category: "wedding" }],
    };
    const [user] = await ProviderSpecialtySvc.attach([venue]);
    expect(user).toBe(venue);
    expect(user).not.toHaveProperty("specialties");
  });
});
