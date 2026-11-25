import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RR-3 (api#300): a Provider declares at least one specialty, with no maximum,
 * and each one must be a catalog subcategory. The catalog query is stubbed;
 * what is under test is what the check accepts and what it refuses.
 */

const prisma = vi.hoisted(() => ({
  category: { findMany: vi.fn() },
}));
vi.mock("../src/utils/prisma", () => ({ prisma }));
vi.mock("../src/utils/cache.util", () => ({
  cached: (_key: string, _ttl: number, fn: () => unknown) => fn(),
  invalidate: vi.fn(async () => {}),
}));

const { default: ProviderSpecialtySvc } =
  await import("../src/modules/users/provider-specialty.service");
const { default: CategoryRepo } =
  await import("../src/modules/category/category.repository");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.category.findMany.mockResolvedValue([
    { slug: "dj", name: "DJ" },
    { slug: "photography", name: "Photography" },
    { slug: "sound_system", name: "Sound system" },
    { slug: "videography", name: "Videography" },
  ]);
});

describe("catalog query", () => {
  it("looks under the main categories and listing, leaving out venue categories", async () => {
    await CategoryRepo.getProviderSpecialties();

    const { where } = prisma.category.findMany.mock.calls[0][0];
    expect(where.isGroup).toBe(false);
    expect(where.OR[0]).toEqual({
      parent: { isGroup: true, parent: { slug: "listing" } },
    });
    expect(where.OR[1].parent).toEqual({ slug: "listing" });
    expect(where.OR[1].slug.notIn).toEqual(
      expect.arrayContaining(["indoor", "outdoor", "hotel", "beach_resort"]),
    );
    expect(where.OR[1].slug.notIn).not.toContain("photography");
  });

  it("gives each its main category, grouped, ungrouped last, retired left out (api#503)", async () => {
    const photo = {
      slug: "photo_video",
      name: "Photo & Video",
      icon: "photo_camera",
      isGroup: true,
    };
    const music = {
      slug: "music_entertainment",
      name: "Music & Entertainment",
      icon: "music_note",
      isGroup: true,
    };
    const listing = {
      slug: "listing",
      name: "Listing",
      icon: null,
      isGroup: false,
    };
    prisma.category.findMany.mockResolvedValue([
      {
        slug: "videography",
        name: "Videography",
        retiredAt: null,
        parent: photo,
      },
      {
        slug: "photography",
        name: "Photography",
        retiredAt: null,
        parent: photo,
      },
      { slug: "dj", name: "DJ", retiredAt: null, parent: music },
      {
        slug: "kite_flying",
        name: "Kite flying",
        retiredAt: null,
        parent: listing,
      },
      {
        slug: "entertainment",
        name: "Entertainment",
        retiredAt: new Date(),
        parent: listing,
      },
    ]);

    const list = await CategoryRepo.getProviderSpecialties();

    expect(list).toEqual([
      {
        slug: "dj",
        name: "DJ",
        group: {
          slug: "music_entertainment",
          name: "Music & Entertainment",
          icon: "music_note",
        },
        listingKind: "service",
      },
      {
        slug: "photography",
        name: "Photography",
        group: {
          slug: "photo_video",
          name: "Photo & Video",
          icon: "photo_camera",
        },
        listingKind: "service",
      },
      {
        slug: "videography",
        name: "Videography",
        group: {
          slug: "photo_video",
          name: "Photo & Video",
          icon: "photo_camera",
        },
        listingKind: "service",
      },
      {
        slug: "kite_flying",
        name: "Kite flying",
        group: null,
        listingKind: null,
      },
    ]);
  });

  it("still names a retired specialty, for Providers who hold it", async () => {
    prisma.category.findMany.mockResolvedValue([
      {
        slug: "entertainment",
        name: "Entertainment",
        retiredAt: new Date(),
        parent: null,
      },
    ]);
    const names = await CategoryRepo.getProviderSpecialtyNames();
    expect(names.get("entertainment")).toBe("Entertainment");
  });

  it("refuses a retired specialty for a new pick, keeps it for one who holds it", async () => {
    prisma.category.findMany.mockResolvedValue([
      { slug: "dj", name: "DJ", retiredAt: null, parent: null },
      {
        slug: "entertainment",
        name: "Entertainment",
        retiredAt: new Date(),
        parent: null,
      },
    ]);
    await expect(
      ProviderSpecialtySvc.check(["entertainment"]),
    ).resolves.toEqual({
      ok: false,
      message: "Unknown specialty: entertainment",
    });
    await expect(
      ProviderSpecialtySvc.check(["dj", "entertainment"], ["entertainment"]),
    ).resolves.toEqual({ ok: true, slugs: ["dj", "entertainment"] });
  });
});

describe("listingKindOf", () => {
  it("says which listing each subcategory is offered as", async () => {
    const { listingKindOf } =
      await import("../src/modules/category/category.repository");
    expect(listingKindOf("tents")).toBe("asset");
    expect(listingKindOf("sound_system")).toBe("asset");
    expect(listingKindOf("photo_booth")).toBe("service");
    expect(listingKindOf("hair_makeup")).toBe("service");
    expect(listingKindOf("kite_flying")).toBeNull();
  });
});

describe("ProviderSpecialtySvc.check", () => {
  it("accepts catalog slugs", async () => {
    await expect(
      ProviderSpecialtySvc.check(["photography", "videography"]),
    ).resolves.toEqual({ ok: true, slugs: ["photography", "videography"] });
  });

  it("has no maximum", async () => {
    const result = await ProviderSpecialtySvc.check([
      "dj",
      "photography",
      "sound_system",
      "videography",
    ]);
    expect(result).toEqual({
      ok: true,
      slugs: ["dj", "photography", "sound_system", "videography"],
    });
  });

  it.each([undefined, null, "photography", {}, []])(
    "refuses %j as no specialties",
    async (declared) => {
      await expect(ProviderSpecialtySvc.check(declared)).resolves.toEqual({
        ok: false,
        message: "Choose at least one specialty",
      });
    },
  );

  it("refuses a list of blanks as no specialties", async () => {
    await expect(ProviderSpecialtySvc.check(["", "  "])).resolves.toEqual({
      ok: false,
      message: "Choose at least one specialty",
    });
  });

  it("names every slug that is not in the catalog", async () => {
    await expect(
      ProviderSpecialtySvc.check(["photography", "plumbing", "beach_resort"]),
    ).resolves.toEqual({
      ok: false,
      message: "Unknown specialty: plumbing, beach_resort",
    });
  });

  it("lets a Provider keep a specialty they already hold, catalog row or not", async () => {
    await expect(
      ProviderSpecialtySvc.check(["dj", "other"], ["other"]),
    ).resolves.toEqual({ ok: true, slugs: ["dj", "other"] });
  });

  it("still refuses a new slug that is not in the catalog", async () => {
    await expect(
      ProviderSpecialtySvc.check(["dj", "plumbing"], ["other"]),
    ).resolves.toEqual({ ok: false, message: "Unknown specialty: plumbing" });
  });

  it("trims each slug and keeps it once", async () => {
    await expect(
      ProviderSpecialtySvc.check([" dj ", "dj", "photography"]),
    ).resolves.toEqual({ ok: true, slugs: ["dj", "photography"] });
  });

  it("refuses values that are not strings", async () => {
    const result = await ProviderSpecialtySvc.check([{ slug: "dj" }]);
    expect(result.ok).toBe(false);
  });
});
