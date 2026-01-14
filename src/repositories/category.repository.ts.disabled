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
            image: true,
            tagline: true,
            gradient: true,
            spotLabel: true,
            spotColor: true,
            icon: true,
          },
        },
        subCategories: {
          select: {
            id: true,
            name: true,
            slug: true,
            image: true,
            tagline: true,
            gradient: true,
            spotLabel: true,
            spotColor: true,
            icon: true,
          },
        },
        _count: {
          select: {
            listings: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  // READ ONE by ID
  static async getCategoryById(id: string) {
    return prisma.category.findUnique({
      where: { id },
      include: {
        parentCategory: true,
        subCategories: true,
        listings: {
          where: {
            status: "published",
          },
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            listings: true,
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
            listings: true,
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
    parentCategoryId?: string;
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
    id: string,
    data: Partial<{
      name: string;
      slug: string;
      description: string;
      parentCategoryId: string;
    }>
  ) {
    return prisma.category.update({
      where: { id },
      data,
      include: {
        parentCategory: true,
        subCategories: true,
      },
    });
  }

  // DELETE
  static async deleteCategory(id: string) {
    return prisma.category.delete({
      where: { id },
    });
  }

  // Check if category exists
  static async categoryExists(id: string) {
    const category = await prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!category;
  }

  // Check if slug exists
  static async slugExists(slug: string, excludeId?: string) {
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
            listings: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
  }
}
