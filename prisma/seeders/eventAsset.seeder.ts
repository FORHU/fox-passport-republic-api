import { PrismaClient } from "@prisma/client"

/**
 * EventAsset records are created as part of event seeding.
 * This seeder exists to keep a 1:1 file with the Prisma model.
 */
export async function seedEventAssets(_prisma: PrismaClient) {
  // No-op: handled by seedEvent
}

