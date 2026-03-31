import { PrismaClient } from "@prisma/client"

/**
 * Seed demo VenueRental records.
 */
export async function seedVenueRentals(prisma: PrismaClient) {
  const venue = await prisma.venue.findFirst()
  const renter = await prisma.user.findFirst()

  if (!venue || !renter) return

  const now = new Date()
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const end = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)

  await prisma.venueRental.create({
    data: {
      venueId: venue.id,
      renterId: renter.id,
      startDate: start,
      endDate: end,
    },
  })
}

