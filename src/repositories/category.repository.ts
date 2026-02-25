import { prisma } from "../utils/prisma";

export default class CategoryRepo {
  // READ ALL
  static async getAllCategories() {
    return prisma.category.findMany({
      include: {
        parentCategory: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        subCategories: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            assets: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  // READ ONE by ID
  static async getCategoryById(id: number | string) {
    return prisma.category.findUnique({
      where: { id: Number(id) },
      include: {
        parentCategory: true,
        subCategories: true,
        assets: true,
        _count: {
          select: {
            assets: true,
            subCategories: true,
          },
        },
      },
    });
  }

  // READ ONE by Slug
  static async getCategoryBySlug(slug: string) {
    return prisma.category.findFirst({
      where: { slug },
      include: {
        parentCategory: true,
        subCategories: true,
        _count: {
          select: {
            assets: true,
          },
        },
      },
    });
  }

  // CREATE
  static async createCategory(data: {
    name: string;
    slug: string;
    description?: string;
    parentCategoryId?: number;
  }) {
    return prisma.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        parentCategoryId: data.parentCategoryId,
      },
      include: {
        parentCategory: true,
      },
    });
  }

  // UPDATE
  static async updateCategory(
    id: number | string,
    data: Partial<{
      name: string;
      slug: string;
      description: string;
      parentCategoryId: number;
    }>
  ) {
    return prisma.category.update({
      where: { id: Number(id) },
      data,
      include: {
        parentCategory: true,
        subCategories: true,
      },
    });
  }

  // DELETE
  static async deleteCategory(id: number | string) {
    return prisma.category.delete({
      where: { id: Number(id) },
    });
  }

  // Check if category exists
  static async categoryExists(id: number | string) {
    const category = await prisma.category.findUnique({
      where: { id: Number(id) },
      select: { id: true },
    });
    return !!category;
  }

  // Check if slug exists
  static async slugExists(slug: string, excludeId?: number) {
    const category = await prisma.category.findFirst({
      where: {
        slug,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    return !!category;
  }

  // Get top-level categories (no parent)
  static async getTopLevelCategories() {
    return prisma.category.findMany({
      where: {
        parentCategoryId: null,
      },
      include: {
        subCategories: true,
        _count: {
          select: {
            assets: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
  }
}
