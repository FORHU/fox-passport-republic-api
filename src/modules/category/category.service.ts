import { AppError, badRequest, conflict, notFound } from "../../utils/errors";
import { recordChange, type AuditActor } from "../audit/audit.service";
import CategoryRepo, { type CategoryWrite } from "./category.repository";

export type CategoryUpdate = Partial<{
  name: string;
  description: string | null;
  icon: string | null;
  parentCategoryId: string;
}>;

export default class CategorySvc {
  /**
   * The browse list. By default it keeps the shape the public pages have always
   * had: every event category, and a listing category only once something
   * carries it. `includeEmpty` is the admin's view of the whole catalog.
   */
  static async getAllCategories(includeEmpty = false) {
    const all = await CategoryRepo.getAllCategories();
    if (includeEmpty) return all;
    return all.filter((c) => c.isEventCategory || c.count > 0);
  }

  // GET CATEGORY BY ID
  static async getCategoryById(id: string) {
    const category = await CategoryRepo.getCategoryById(id);
    if (!category) {
      throw notFound("Category");
    }
    return category;
  }

  // GET CATEGORY BY SLUG
  static async getCategoryBySlug(slug: string) {
    const category = await CategoryRepo.getCategoryBySlug(slug);
    if (!category) {
      throw notFound("Category");
    }
    return category;
  }

  /**
   * The catalog is two levels deep: a subcategory's parent must be a root.
   * Holding that here means no chain of parents can ever loop.
   */
  private static async assertRootParent(parentCategoryId: string) {
    const parent = await CategoryRepo.findById(parentCategoryId);
    if (!parent) {
      throw badRequest("Parent category not found");
    }
    if (parent.parentCategoryId) {
      throw badRequest("The parent must be Event or Listing");
    }
  }

  // CREATE CATEGORY
  static async createCategory(data: CategoryWrite, actor?: AuditActor) {
    if (await CategoryRepo.slugExists(data.slug)) {
      throw conflict("A category with this slug already exists");
    }
    await this.assertRootParent(data.parentCategoryId);

    const category = await CategoryRepo.createCategory(data);
    await CategoryRepo.invalidateAll();
    await recordChange(actor, "category.create", category.id, {
      current: category,
    });
    return category;
  }

  // UPDATE CATEGORY
  static async updateCategory(
    id: string,
    data: CategoryUpdate & { slug?: unknown },
    actor?: AuditActor,
  ) {
    const existing = await CategoryRepo.findById(id);
    if (!existing) {
      throw notFound("Category");
    }

    // The slug links the row to the values listings already carry.
    if (data.slug !== undefined && data.slug !== existing.slug) {
      throw badRequest("A category's slug cannot be changed");
    }

    if (
      data.parentCategoryId !== undefined &&
      data.parentCategoryId !== existing.parentCategoryId
    ) {
      if (!existing.parentCategoryId) {
        throw badRequest("Event and Listing cannot be moved");
      }
      if (data.parentCategoryId === id) {
        throw new AppError("Category cannot be its own parent", 400);
      }
      await this.assertRootParent(data.parentCategoryId);
    }

    const { slug: _slug, ...changes } = data;
    const category = await CategoryRepo.updateCategory(id, changes);
    await CategoryRepo.invalidateAll();
    await recordChange(actor, "category.update", id, {
      previous: existing,
      current: category,
    });
    return category;
  }

  // DELETE CATEGORY
  static async deleteCategory(id: string) {
    // Check if category exists
    const exists = await CategoryRepo.categoryExists(id);
    if (!exists) {
      throw notFound("Category");
    }

    // Note: This will fail if there are listings or subcategories
    return CategoryRepo.deleteCategory(id);
  }

  // GET TOP-LEVEL CATEGORIES
  static async getTopLevelCategories() {
    return CategoryRepo.getTopLevelCategories();
  }
}
