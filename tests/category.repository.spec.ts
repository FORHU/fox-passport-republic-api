import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * BUG-19 (api#163): the category list joins the catalog to the values
 * listings carry. Older readers (the web category page, mobile, the sitemap)
 * key on `name` being that stored value, so the catalog adds fields without
 * changing it. Prisma and the cache are stubbed.
 */

const EVENT = "root-event";
const LISTING = "root-listing";

const prisma = vi.hoisted(() => ({
  category: { findMany: vi.fn() },
  asset: { groupBy: vi.fn(async () => []) },
  venue: { groupBy: vi.fn(async () => []) },
  eventTemplate: { groupBy: vi.fn(async () => []) },
  $queryRaw: vi.fn(async () => []),
}));
vi.mock("../src/utils/prisma", () => ({ prisma }));
vi.mock("../src/utils/cache.util", () => ({
  cached: (_key: string, _ttl: number, fn: () => unknown) => fn(),
  invalidate: vi.fn(async () => {}),
}));

const { default: CategoryRepo } =
  await import("../src/modules/category/category.repository");

beforeEach(() => {
  vi.clearAllMocks();
  prisma.category.findMany.mockResolvedValue([
    {
      id: "c-beach",
      slug: "beach_resort",
      name: "Beach Resort",
      description: "Sand and sea",
      icon: "beach_access",
      parentCategoryId: LISTING,
      parent: { slug: "listing" },
    },
    {
      id: "c-birthday",
      slug: "birthday",
      name: "Birthday",
      description: null,
      icon: "cake",
      parentCategoryId: EVENT,
      parent: { slug: "event" },
    },
  ]);
  prisma.venue.groupBy.mockResolvedValue([
    { category: "beach_resort", _count: { category: 3 } },
    { category: "legacy_spot", _count: { category: 1 } },
  ]);
});

describe("CategoryRepo.getAllCategories", () => {
  it("keeps name as the stored value and adds the catalog fields", async () => {
    const all = await CategoryRepo.getAllCategories();
    const beach = all.find((c) => c.name === "beach_resort");

    expect(beach).toMatchObject({
      name: "beach_resort",
      slug: "beach_resort",
      label: "Beach Resort",
      description: "Sand and sea",
      icon: "beach_access",
      id: "c-beach",
      group: "listing",
      isEventCategory: false,
      count: 3,
      sources: { venues: 3 },
    });
    // Only subcategories are loaded: the roots are groups, not categories.
    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentCategoryId: { not: null } } }),
    );
  });

  it("still lists a value with no catalog row, without an id", async () => {
    const legacy = (await CategoryRepo.getAllCategories()).find(
      (c) => c.name === "legacy_spot",
    );

    expect(legacy).toMatchObject({ id: null, count: 1, group: "listing" });
  });
});

describe("CategoryRepo.getCategoryBySlug", () => {
  it("answers in the list's shape, name still the stored value", async () => {
    const found = await CategoryRepo.getCategoryBySlug("Beach_Resort");

    expect(found).toMatchObject({
      id: "c-beach",
      name: "beach_resort",
      slug: "beach_resort",
      label: "Beach Resort",
    });
  });

  it("resolves a listing value with no catalog row, id falling back to its name", async () => {
    expect(await CategoryRepo.getCategoryBySlug("legacy_spot")).toMatchObject({
      id: "legacy_spot",
      name: "legacy_spot",
    });
  });

  it("does not treat the roots as categories", async () => {
    expect(await CategoryRepo.getCategoryBySlug("event")).toBeNull();
  });
});
