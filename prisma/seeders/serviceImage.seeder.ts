import { PrismaClient } from "@prisma/client"

/**
 * ServiceImage records are created as part of service seeding.
 * This seeder exists to keep a 1:1 file with the Prisma model.
 */
export async function seedServiceImages(_prisma: PrismaClient) {
  // No-op: extend when you need explicit seeding
}

