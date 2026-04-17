import { BillingRate, PrismaClient, TransactionStatus } from "@prisma/client"

export async function seedEventAsset(prisma: PrismaClient) {
  const event = await prisma.event.findFirst({
    where: { name: "Tech Networking Night" },
  })

  const assets = await prisma.asset.findMany({
    where: { category: "Equipment" },
  })

  if (!event || assets.length === 0) return

  for (const asset of assets) {
    await prisma.eventAsset.upsert({
      where: {
        eventId_assetId: {
          eventId: event.id,
          assetId: asset.id,
        },
      },
      update: {},
      create: {
        eventId: event.id,
        assetId: asset.id,
        quantity: 1,
        agreedPrice: asset.price,
        billingRate: asset.billingRate,
        status: TransactionStatus.approved,
      },
    })
  }
}
