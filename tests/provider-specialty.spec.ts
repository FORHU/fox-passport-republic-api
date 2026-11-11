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
  it("looks under the listing group and leaves out venue categories", async () => {
    await CategoryRepo.getProviderSpecialties();

    const { where } = prisma.category.findMany.mock.calls[0][0];
    expect(where.parent).toEqual({ slug: "listing" });
    expect(where.slug.notIn).toEqual(
      expect.arrayContaining(["indoor", "outdoor", "hotel", "beach_resort"]),
    );
    expect(where.slug.notIn).not.toContain("photography");
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
