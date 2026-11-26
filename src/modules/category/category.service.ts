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
   * A subcategory's parent is a root, or a Provider main category under
   * Listing (api#503), never deeper. A main category itself only sits under
   * Listing, and a row with subcategories of its own can't go under a main
   * category. Holding that here means no chain of parents can ever loop.
   * `moving` is the row being moved; omitted for a new one.
   */
  private static async assertParent(
    parentCategoryId: string,
    moving?: { id: string; isGroup: boolean },
  ) {
    const parent = await CategoryRepo.findById(parentCategoryId);
    if (!parent) {
      throw badRequest("Parent category not found");
    }
    if (moving?.isGroup) {
      const root = parent.parentCategoryId ? null : parent;
      if (root?.slug !== "listing") {
        throw badRequest("A main category can only sit under Listing");
      }
      return;
    }
    if (!parent.parentCategoryId) return;

    const grandparent = parent.isGroup
      ? await CategoryRepo.findById(parent.parentCategoryId)
      : null;
    if (
      !parent.isGroup ||
      !grandparent ||
      grandparent.parentCategoryId ||
      grandparent.slug !== "listing"
    ) {
      throw badRequest(
        "The parent must be Event, Listing or a Provider main category",
      );
    }
    if (moving && (await CategoryRepo.hasChildren(moving.id))) {
      throw badRequest(
        "A category with subcategories can't go under a main category",
      );
    }
  }

  // CREATE CATEGORY
  static async createCategory(data: CategoryWrite, actor?: AuditActor) {
    if (await CategoryRepo.slugExists(data.slug)) {
      throw conflict("A category with this slug already exists");
    }
    await this.assertParent(data.parentCategoryId);

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
      await this.assertParent(data.parentCategoryId, {
        id,
        isGroup: existing.isGroup,
      });
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

  /** The Provider main categories, for placing a new specialty under one. */
  static async getProviderGroups() {
    return CategoryRepo.getProviderGroups();
  }

  /**
   * Every specialty a Provider can declare ({ slug, name, group }), the same list the
   * API checks applications and profile edits against (RR-3), so forms never
   * offer a value the API would refuse.
   */
  static async getProviderSpecialties() {
    return CategoryRepo.getProviderSpecialties();
  }
}
