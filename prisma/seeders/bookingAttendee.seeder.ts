import { PrismaClient } from "@prisma/client"

/**
 * BookingAttendee records are created as part of booking seeding.
 * This seeder exists to keep a 1:1 file with the Prisma model.
 */
export async function seedBookingAttendees(_prisma: PrismaClient) {
  // No-op: handled by seedBooking
}

