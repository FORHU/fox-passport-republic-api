import { prisma } from "../utils/prisma";

type CategorySummary = {
  name: string;
  count: number;
  sources: {
    assets: number;
    venues: number;
    services: number;
  };
};

/**
 * The current schema has no `Category` model. Categories are stored as plain strings
 * on `Asset.category`, `Venue.category`, and `Service.category`.
 */
export default class CategoryRepo {
  static async getAllCategories(): Promise<CategorySummary[]> {
    const [assetCats, venueCats, serviceCats] = await Promise.all([
      prisma.asset.groupBy({
        by: ["category"],
        where: { deletedAt: null },
        _count: { category: true },
      }),
      prisma.venue.groupBy({
        by: ["category"],
        _count: { category: true },
      }),
      prisma.service.groupBy({
        by: ["category"],
        _count: { category: true },
      }),
    ]);

    const map = new Map<string, CategorySummary>();

    for (const row of assetCats) {
      const key = row.category;
      const existing =
        map.get(key) ??
        ({ name: key, count: 0, sources: { assets: 0, venues: 0, services: 0 } } as CategorySummary);
      existing.sources.assets = row._count.category;
      map.set(key, existing);
    }

    for (const row of venueCats) {
      const key = row.category;
      const existing =
        map.get(key) ??
        ({ name: key, count: 0, sources: { assets: 0, venues: 0, services: 0 } } as CategorySummary);
      existing.sources.venues = row._count.category;
      map.set(key, existing);
    }

    for (const row of serviceCats) {
      const key = row.category;
      const existing =
        map.get(key) ??
        ({ name: key, count: 0, sources: { assets: 0, venues: 0, services: 0 } } as CategorySummary);
      existing.sources.services = row._count.category;
      map.set(key, existing);
    }

    for (const v of map.values()) {
      v.count = v.sources.assets + v.sources.venues + v.sources.services;
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  static async getCategoryById(id: string) {
    const categories = await this.getAllCategories();
    return categories.find((c) => c.name === id) ?? null;
  }

  static async getCategoryBySlug(slug: string) {
    const categories = await this.getAllCategories();
    const found = categories.find((c) => c.name.toLowerCase() === slug.toLowerCase());
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
