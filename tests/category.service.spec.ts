import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * BUG-19 (api#163): admins create and edit categories. The catalog is two
 * levels deep (roots `event` and `listing`), slugs are unique and fixed, and
 * every write drops the cached list and leaves an audit entry. The repository
 * is stubbed; what is asserted is the service's decisions.
 */

const audit = vi.hoisted(() => ({ recordChange: vi.fn(async () => {}) }));
vi.mock("../src/modules/audit/audit.service", () => audit);

const repo = vi.hoisted(() => ({
  getAllCategories: vi.fn(),
  findById: vi.fn(),
  slugExists: vi.fn(async () => false),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  invalidateAll: vi.fn(async () => {}),
}));
vi.mock("../src/modules/category/category.repository", () => ({
  default: repo,
}));

const { default: CategorySvc } =
  await import("../src/modules/category/category.service");

const EVENT_ROOT = "00000000-0000-4000-8000-000000000001";
const LISTING_ROOT = "00000000-0000-4000-8000-000000000002";
const BIRTHDAY = "00000000-0000-4000-8000-000000000010";

const rows: Record<string, Record<string, unknown>> = {
  [EVENT_ROOT]: { id: EVENT_ROOT, slug: "event", parentCategoryId: null },
  [LISTING_ROOT]: { id: LISTING_ROOT, slug: "listing", parentCategoryId: null },
  [BIRTHDAY]: {
    id: BIRTHDAY,
    slug: "birthday",
    name: "Birthday",
    parentCategoryId: EVENT_ROOT,
  },
};

const actor = { userId: "admin-1", email: "admin@test.local" };

beforeEach(() => {
  vi.clearAllMocks();
  repo.findById.mockImplementation(async (id: string) => rows[id] ?? null);
  repo.slugExists.mockResolvedValue(false);
  repo.createCategory.mockImplementation(async (data) => ({
    id: "new-id",
    ...data,
  }));
  repo.updateCategory.mockImplementation(async (id: string, data) => ({
    ...rows[id],
    ...data,
  }));
});

describe("CategorySvc.createCategory", () => {
  const input = {
    name: "Pool Party",
    slug: "pool_party",
    parentCategoryId: EVENT_ROOT,
  };

  it("creates a subcategory under a root, drops the cache and audits it", async () => {
    const created = await CategorySvc.createCategory(input, actor);

    expect(repo.createCategory).toHaveBeenCalledWith(input);
    expect(created).toMatchObject({ id: "new-id", slug: "pool_party" });
    expect(repo.invalidateAll).toHaveBeenCalledTimes(1);
    expect(audit.recordChange).toHaveBeenCalledWith(
      actor,
      "category.create",
      "new-id",
      { current: created },
    );
  });

  it("refuses a slug that is taken with 409", async () => {
    repo.slugExists.mockResolvedValue(true);

    await expect(
      CategorySvc.createCategory(input, actor),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.createCategory).not.toHaveBeenCalled();
    expect(repo.invalidateAll).not.toHaveBeenCalled();
  });

  it("refuses a parent that does not exist with 400", async () => {
    await expect(
      CategorySvc.createCategory(
        { ...input, parentCategoryId: "00000000-0000-4000-8000-0000000000ff" },
        actor,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "Parent category not found",
    });
  });

  it("refuses a parent that is itself a subcategory, keeping two levels", async () => {
    await expect(
      CategorySvc.createCategory(
        { ...input, parentCategoryId: BIRTHDAY },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.createCategory).not.toHaveBeenCalled();
  });
});

describe("CategorySvc.updateCategory", () => {
  it("edits display fields, drops the cache and audits before and after", async () => {
    const updated = await CategorySvc.updateCategory(
      BIRTHDAY,
      { name: "Birthdays", icon: "cake" },
      actor,
    );

    expect(repo.updateCategory).toHaveBeenCalledWith(BIRTHDAY, {
      name: "Birthdays",
      icon: "cake",
    });
    expect(repo.invalidateAll).toHaveBeenCalledTimes(1);
    expect(audit.recordChange).toHaveBeenCalledWith(
      actor,
      "category.update",
      BIRTHDAY,
      { previous: rows[BIRTHDAY], current: updated },
    );
  });

  it("moves a subcategory to the other root", async () => {
    await CategorySvc.updateCategory(
      BIRTHDAY,
      { parentCategoryId: LISTING_ROOT },
      actor,
    );

    expect(repo.updateCategory).toHaveBeenCalledWith(BIRTHDAY, {
      parentCategoryId: LISTING_ROOT,
    });
  });

  it("answers 404 for a category that does not exist", async () => {
    await expect(
      CategorySvc.updateCategory(
        "00000000-0000-4000-8000-0000000000ff",
        { name: "X y" },
        actor,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses to change the slug, which links the row to listings", async () => {
    await expect(
      CategorySvc.updateCategory(BIRTHDAY, { slug: "bday" }, actor),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.updateCategory).not.toHaveBeenCalled();
  });

  it("refuses to move a root under another category", async () => {
    await expect(
      CategorySvc.updateCategory(
        EVENT_ROOT,
        { parentCategoryId: LISTING_ROOT },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.updateCategory).not.toHaveBeenCalled();
  });

  it("refuses a subcategory as the new parent", async () => {
    repo.findById.mockImplementation(async (id: string) =>
      id === "other-child"
        ? { id, slug: "x", parentCategoryId: LISTING_ROOT }
        : (rows[id] ?? null),
    );

    await expect(
      CategorySvc.updateCategory(
        BIRTHDAY,
        { parentCategoryId: "other-child" },
        actor,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("CategorySvc.getAllCategories", () => {
  const list = [
    { name: "birthday", isEventCategory: true, count: 0 },
    { name: "hotel", isEventCategory: false, count: 3 },
    { name: "mc", isEventCategory: false, count: 0 },
  ];

  it("keeps the public shape: event categories plus listing categories in use", async () => {
    repo.getAllCategories.mockResolvedValue(list);

    const names = (await CategorySvc.getAllCategories()).map((c) => c.name);
    expect(names).toEqual(["birthday", "hotel"]);
  });

  it("returns the whole catalog when asked to include empty categories", async () => {
    repo.getAllCategories.mockResolvedValue(list);

    expect(await CategorySvc.getAllCategories(true)).toHaveLength(3);
  });
});
