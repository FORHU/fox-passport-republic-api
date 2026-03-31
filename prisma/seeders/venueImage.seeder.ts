import { PrismaClient } from "@prisma/client"

/**
 * VenueImage records are created as part of venue seeding.
 * This seeder exists to keep a 1:1 file with the Prisma model.
 */
export async function seedVenueImages(_prisma: PrismaClient) {
  // No-op: handled by seedVenue
}

