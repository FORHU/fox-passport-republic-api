import { PrismaClient } from "@prisma/client"

/**
 * AssetImage records are created as part of asset seeding.
 * This seeder exists to keep a 1:1 file with the Prisma model.
 */
export async function seedAssetImages(_prisma: PrismaClient) {
  // No-op: handled by seedAsset
}

