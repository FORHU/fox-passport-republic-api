import CategoryRepo from "../repositories/category.repository";

export default class CategorySvc {
    // GET ALL CATEGORIES
    static async getAllCategories() {
        return CategoryRepo.getAllCategories();
    }

    // GET CATEGORY BY ID
    static async getCategoryById(id: string) {
        const category = await CategoryRepo.getCategoryById(String(id));
        if (!category) {
            throw new Error("Category not found");
        }
        return category;
    }

    // GET CATEGORY BY SLUG
    static async getCategoryBySlug(slug: string) {
        const category = await CategoryRepo.getCategoryBySlug(slug);
        if (!category) {
            throw new Error("Category not found");
        }
        return category;
    }

    // CREATE CATEGORY
    static async createCategory(data: {
        name: string;
        slug: string;
        description?: string;
        parentCategoryId?: string;
    }) {
        // Check if slug already exists
        const slugExists = await CategoryRepo.slugExists(data.slug);
        if (slugExists) {
            throw new Error("Category slug already exists");
        }

        // If parentCategoryId is provided, check if it exists
        if (data.parentCategoryId) {
            const parentExists = await CategoryRepo.categoryExists(String(data.parentCategoryId));
            if (!parentExists) {
                throw new Error("Parent category not found");
            }
        }

        return CategoryRepo.createCategory({
            ...data,
            parentCategoryId: data.parentCategoryId ? String(data.parentCategoryId) : undefined,
        });
    }

    // UPDATE CATEGORY
    static async updateCategory(
        id: string,
        data: Partial<{
            name: string;
            slug: string;
            description: string;
            parentCategoryId: string;
        }>
    ) {
        // Check if category exists
        const exists = await CategoryRepo.categoryExists(String(id));
        if (!exists) {
            throw new Error("Category not found");
        }

        // If updating slug, check if new slug is available
        if (data.slug) {
            const slugExists = await CategoryRepo.slugExists(data.slug, String(id));
            if (slugExists) {
                throw new Error("Category slug already exists");
            }
        }

        // If updating parent, check if parent exists and prevent circular reference
        if (data.parentCategoryId) {
            if (data.parentCategoryId === id) {
                throw new Error("Category cannot be its own parent");
            }
            const parentExists = await CategoryRepo.categoryExists(String(data.parentCategoryId));
            if (!parentExists) {
                throw new Error("Parent category not found");
            }
        }

        return CategoryRepo.updateCategory(String(id), {
            ...data,
            parentCategoryId: data.parentCategoryId ? String(data.parentCategoryId) : undefined,
        });
    }

    // DELETE CATEGORY
    static async deleteCategory(id: string) {
        // Check if category exists
        const exists = await CategoryRepo.categoryExists(String(id));
        if (!exists) {
            throw new Error("Category not found");
        }

        // Note: This will fail if there are listings or subcategories
        return CategoryRepo.deleteCategory(String(id));
    }

    // GET TOP-LEVEL CATEGORIES
    static async getTopLevelCategories() {
        return CategoryRepo.getTopLevelCategories();
    }
}
