import { prisma } from "../../utils/prisma";
import { EventCategory, VenueCategory } from "@prisma/client";
import { cached, invalidate } from "../../utils/cache.util";

/** The two roots of the catalog; every other category sits under one of them. */
export type CategoryGroup = "event" | "listing";

type CategorySources = {
  assets: number;
  venues: number;
  services: number;
  events: number;
};

export type CategorySummary = {
  /** The slug, kept as `name` because the web, mobile and sitemap key on it. */
  name: string;
  count: number;
  isEventCategory: boolean;
  sources: CategorySources;
  /** Null for a value listings carry that has no catalog row. */
  id: string | null;
  slug: string;
  /** The display name an admin edits. */
  label: string | null;
  description: string | null;
  icon: string | null;
  parentCategoryId: string | null;
  /** The root it sits under, even two levels down. */
  group: CategoryGroup | null;
  /** A Provider main category (api#503); no listing carries it. */
  isGroup: boolean;
  /** No longer offered for new Provider picks. */
  retired: boolean;
};

export type CategoryWrite = {
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  parentCategoryId: string;
};

const ALL_KEY = "categories:all";

const emptySources = (): CategorySources => ({
  assets: 0,
  venues: 0,
  services: 0,
  events: 0,
});

/**
 * Categories are a catalog (`categories`, display data an admin edits) joined
 * by slug to the plain category values stored on `Asset.category`,
 * `Venue.category`, `Service.category` and `EventTemplate.category`.
 */
export default class CategoryRepo {
  /**
   * The whole catalog with listing counts, cached for five minutes. Catalog
   * writes drop the cache (`invalidateAll`); listing writes deliberately do
   * not: the value is a set of counts on a browse page, nobody is waiting to
   * see their own asset move a number, and wiring this to every
   * asset/venue/service/template write would spread cache knowledge across
   * four modules to save at most five minutes of staleness on a count.
   */
  static async getAllCategories(): Promise<CategorySummary[]> {
    return cached(ALL_KEY, 5 * 60, () => this.computeAllCategories());
  }

  static async invalidateAll(): Promise<void> {
    await invalidate(ALL_KEY);
  }

  private static async computeAllCategories(): Promise<CategorySummary[]> {
    const [catalog, assetCats, venueCats, rawServiceCats, eventTemplateCats] =
      await Promise.all([
        prisma.category.findMany({
          where: { parentCategoryId: { not: null } },
          include: {
            parent: {
              select: { slug: true, parent: { select: { slug: true } } },
            },
          },
        }),
        prisma.asset.groupBy({
          by: ["category"],
          where: { deletedAt: null },
          _count: { category: true },
        }),
        prisma.venue.groupBy({
          by: ["category"],
          _count: { category: true },
        }),
        // Raw query bypasses Prisma enum validation — handles legacy/mismatched values in DB
        prisma.$queryRaw<{ category: string; count: bigint }[]>`
        SELECT category, COUNT(*)::int AS count
        FROM services
        WHERE "deletedAt" IS NULL
        GROUP BY category
      `,
        prisma.eventTemplate.groupBy({
          by: ["category"],
          _count: { category: true },
        }),
      ]);

    const map = new Map<string, CategorySummary>();
    const eventCategoryKeys = new Set<string>(Object.values(EventCategory));

    // The catalog first, so every subcategory appears even with no listings.
    for (const row of catalog) {
      // The root: a specialty under a main category (api#503) is still a
      // listing category.
      const group = (row.parent?.parent?.slug ??
        row.parent?.slug ??
        null) as CategoryGroup | null;
      map.set(row.slug, {
        name: row.slug,
        count: 0,
        isEventCategory: group === "event",
        sources: emptySources(),
        id: row.id,
        slug: row.slug,
        label: row.name,
        description: row.description,
        icon: row.icon,
        parentCategoryId: row.parentCategoryId,
        group,
        isGroup: row.isGroup,
        retired: row.retiredAt !== null,
      });
    }

    // A value no catalog row covers (legacy or mismatched data) still shows,
    // so the counts stay complete; it has no id, so it cannot be edited.
    const entry = (key: string): CategorySummary => {
      const existing = map.get(key);
      if (existing) return existing;
      const isEvent = eventCategoryKeys.has(key);
      const created: CategorySummary = {
        name: key,
        count: 0,
        isEventCategory: isEvent,
        sources: emptySources(),
        id: null,
        slug: key,
        label: null,
        description: null,
        icon: null,
        parentCategoryId: null,
        group: isEvent ? "event" : "listing",
        isGroup: false,
        retired: false,
      };
      map.set(key, created);
      return created;
    };

    for (const row of assetCats) {
      entry(row.category).sources.assets = row._count.category;
    }
    for (const row of venueCats) {
      entry(row.category).sources.venues = row._count.category;
    }
    for (const row of rawServiceCats) {
      entry(row.category).sources.services = Number(row.count);
    }
    for (const row of eventTemplateCats) {
      entry(row.category).sources.events = row._count.category;
    }

    for (const v of map.values()) {
      v.count =
        v.sources.assets +
        v.sources.venues +
        v.sources.services +
        v.sources.events;
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  static async findById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  }

  /**
   * The public single-category reads answer from the summary list, so they keep
   * its shape: `name` stays the stored value ("beach_resort") the category page
   * keys its labels and gradients on, a listing value with no catalog row still
   * resolves (its id is its name, as before), and the roots are not pages.
   */
  static async getCategoryById(id: string) {
    const categories = await this.getAllCategories();
    return categories.find((c) => c.id === id) ?? null;
  }

  static async getCategoryBySlug(slug: string) {
    const key = slug.toLowerCase();
    const found = (await this.getAllCategories()).find(
      (c) => c.name.toLowerCase() === key,
    );
    return found ? { ...found, id: found.id ?? found.name } : null;
  }

  static async slugExists(slug: string, excludeId?: string) {
    const found = await prisma.category.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    return !!found;
  }

  static async createCategory(data: CategoryWrite) {
    return prisma.category.create({ data });
  }

  static async updateCategory(
    id: string,
    data: Partial<Omit<CategoryWrite, "slug">>,
  ) {
    return prisma.category.update({ where: { id }, data });
  }

  static async deleteCategory(_id?: string): Promise<never> {
    // Out of scope for BUG-19; the message no longer claims the table is missing.
    throw new Error("Deleting categories is not supported yet");
  }

  static async hasChildren(id: string) {
    return (
      (await prisma.category.count({ where: { parentCategoryId: id } })) > 0
    );
  }

  static async categoryExists(id: string) {
    return !!(await this.findById(id));
  }

  /** The roots (`event`, `listing`): the parents a subcategory may have. */
  static async getTopLevelCategories() {
    return prisma.category.findMany({
      where: { parentCategoryId: null },
      orderBy: { slug: "asc" },
    });
  }

  /**
   * Every Provider specialty row, retired ones included: the subcategories of a
   * main category, plus the listing subcategories that sit directly under
   * `listing` and are neither a venue category nor a main category (the older,
   * ungrouped ones). Venue categories are left out: a Provider lists services
   * and equipment, never a venue.
   */
  private static async providerSpecialtyRows() {
    return prisma.category.findMany({
      where: {
        isGroup: false,
        OR: [
          { parent: { isGroup: true, parent: { slug: "listing" } } },
          {
            parent: { slug: "listing" },
            slug: { notIn: Object.values(VenueCategory) },
          },
        ],
      },
      select: {
        slug: true,
        name: true,
        retiredAt: true,
        parent: {
          select: { slug: true, name: true, icon: true, isGroup: true },
        },
      },
    });
  }

  /**
   * The specialties a Provider can declare, each with its main category
   * (`group`, null for an older one that has none), grouped by main category
   * and then by name, with the ungrouped ones last. Retired ones are left out.
   * Read live, so a subcategory an admin adds is valid at once.
   */
  static async getProviderSpecialties(): Promise<ProviderSpecialty[]> {
    const rows = await this.providerSpecialtyRows();
    return rows
      .filter((r) => !r.retiredAt)
      .map((r) => ({
        slug: r.slug,
        name: r.name,
        group: r.parent?.isGroup
          ? { slug: r.parent.slug, name: r.parent.name, icon: r.parent.icon }
          : null,
      }))
      .sort((a, b) => {
        if (!a.group !== !b.group) return a.group ? -1 : 1;
        const byGroup = (a.group?.name ?? "").localeCompare(
          b.group?.name ?? "",
        );
        return byGroup !== 0 ? byGroup : a.name.localeCompare(b.name);
      });
  }

  /**
   * Display names for every Provider specialty, retired ones included, so a
   * Provider who still holds one sees its name rather than its slug.
   */
  static async getProviderSpecialtyNames(): Promise<Map<string, string>> {
    const rows = await this.providerSpecialtyRows();
    return new Map(rows.map((r) => [r.slug, r.name]));
  }

  /** The main categories under `listing`, by name. */
  static async getProviderGroups() {
    return prisma.category.findMany({
      where: { isGroup: true, parent: { slug: "listing" } },
      select: { id: true, slug: true, name: true, icon: true },
      orderBy: { name: "asc" },
    });
  }
}

export type ProviderSpecialty = {
  slug: string;
  name: string;
  /** Its main category; null for an older specialty that has none. */
  group: { slug: string; name: string; icon: string | null } | null;
};
