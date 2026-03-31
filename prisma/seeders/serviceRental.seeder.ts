import { PrismaClient } from "@prisma/client"

/**
 * Seed demo ServiceRental records.
 */
export async function seedServiceRentals(prisma: PrismaClient) {
  const service = await prisma.service.findFirst()
  const renter = await prisma.user.findFirst()

  if (!service || !renter) return

  const now = new Date()
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const end = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)

  await prisma.serviceRental.create({
    data: {
      serviceId: service.id,
      renterId: renter.id,
      startDate: start,
      endDate: end,
    },
  })
}

