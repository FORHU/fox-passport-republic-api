import { PrismaClient } from "@prisma/client"

/**
 * Seed demo AssetRental records.
 */
export async function seedAssetRentals(prisma: PrismaClient) {
  const asset = await prisma.asset.findFirst()
  const renter = await prisma.user.findFirst()

  if (!asset || !renter) return

  const now = new Date()
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const end = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)

  await prisma.assetRental.upsert({
    where: {
      // Synthetic unique constraint via composite fields using a unique ID
      id: asset.id, // use asset.id as a stable key to avoid duplicates
    },
    update: {},
    create: {
      assetId: asset.id,
      renterId: renter.id,
      startDate: start,
      endDate: end,
    },
  })
}

