import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export default class EventCategoryRepo {
    // CREATE
    static async createCategory(data: { name: string; slug: string; iconUrl?: string }) {
        return prisma.eventCategory.create({
            data,
        });
    }

    // READ ALL
    static async getAllCategories() {
        return prisma.eventCategory.findMany({
            orderBy: { name: "asc" },
        });
    }

    // READ ONE BY ID
    static async getCategoryById(id: string) {
        return prisma.eventCategory.findUnique({
            where: { id },
        });
    }

    // READ ONE BY SLUG
    static async getCategoryBySlug(slug: string) {
        return prisma.eventCategory.findUnique({
            where: { slug },
        });
    }

    // UPDATE
    static async updateCategory(id: string, data: Partial<{ name: string; slug: string; iconUrl: string }>) {
        return prisma.eventCategory.update({
            where: { id },
            data,
        });
    }

    // DELETE
    static async deleteCategory(id: string) {
        return prisma.eventCategory.delete({
            where: { id },
        });
    }
}
