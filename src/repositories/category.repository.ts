import { prisma } from "../utils/prisma";
import { EventCategory } from "@prisma/client";

type CategorySummary = {
  name: string;
  count: number;
  isEventCategory: boolean;
  sources: {
    assets: number;
    venues: number;
    services: number;
    events: number;
  };
};

/**
 * The current schema has no `Category` model. Categories are stored as plain strings
 * on `Asset.category`, `Venue.category`, `Service.category`, and `EventTemplate.category`.
 */
export default class CategoryRepo {
  static async getAllCategories(): Promise<CategorySummary[]> {
    const [assetCats, venueCats, rawServiceCats, eventTemplateCats] =
      await Promise.all([
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

    const serviceCats = rawServiceCats.map((r) => ({
      category: r.category,
      _count: { category: Number(r.count) },
    }));

    const map = new Map<string, CategorySummary>();

    const eventCategoryKeys = new Set(Object.values(EventCategory));

    // Seed all EventCategory enum values so they always appear on the landing page
    for (const key of eventCategoryKeys) {
      map.set(key, {
        name: key,
        count: 0,
        isEventCategory: true,
        sources: { assets: 0, venues: 0, services: 0, events: 0 },
      });
    }

    for (const row of assetCats) {
      const key = row.category;
      const existing =
        map.get(key) ??
        ({
          name: key,
          count: 0,
          isEventCategory: false,
          sources: { assets: 0, venues: 0, services: 0, events: 0 },
        } as CategorySummary);
      existing.sources.assets = row._count.category;
      map.set(key, existing);
    }

    for (const row of venueCats) {
      const key = row.category;
      const existing =
        map.get(key) ??
        ({
          name: key,
          count: 0,
          isEventCategory: eventCategoryKeys.has(key as EventCategory),
          sources: { assets: 0, venues: 0, services: 0, events: 0 },
        } as CategorySummary);
      existing.sources.venues = row._count.category;
      map.set(key, existing);
    }

    for (const row of serviceCats) {
      const key = row.category;
      const existing =
        map.get(key) ??
        ({
          name: key,
          count: 0,
          isEventCategory: eventCategoryKeys.has(key as EventCategory),
          sources: { assets: 0, venues: 0, services: 0, events: 0 },
        } as CategorySummary);
      existing.sources.services = row._count.category;
      map.set(key, existing);
    }

    for (const row of eventTemplateCats) {
      const key = row.category;
      const existing =
        map.get(key) ??
        ({
          name: key,
          count: 0,
          isEventCategory: eventCategoryKeys.has(key as EventCategory),
          sources: { assets: 0, venues: 0, services: 0, events: 0 },
        } as CategorySummary);
      existing.sources.events = row._count.category;
      map.set(key, existing);
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

  static async getCategoryById(id: string) {
    const categories = await this.getAllCategories();
    return categories.find((c) => c.name === id) ?? null;
  }

  static async getCategoryBySlug(slug: string) {
    const categories = await this.getAllCategories();
    const found = categories.find(
      (c) => c.name.toLowerCase() === slug.toLowerCase(),
    );
    if (!found) return null;
    return { id: found.name, name: found.name, slug: found.name.toLowerCase() };
  }

  static async createCategory(_data?: any): Promise<never> {
    throw new Error("Category model does not exist in current schema");
  }

  static async updateCategory(_id?: string, _data?: any): Promise<never> {
    throw new Error("Category model does not exist in current schema");
  }

  static async deleteCategory(_id?: string): Promise<never> {
    throw new Error("Category model does not exist in current schema");
  }

  static async categoryExists(id: string) {
    const category = await this.getCategoryById(id);
    return !!category;
  }

  static async slugExists(slug: string, _excludeId?: string) {
    const category = await this.getCategoryBySlug(slug);
    return !!category;
  }

  static async getTopLevelCategories() {
    return this.getAllCategories();
  }
}
