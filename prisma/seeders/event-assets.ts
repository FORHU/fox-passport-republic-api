import { PrismaClient } from "@prisma/client"

export async function seedEventAssets(prisma: PrismaClient) {
    const event = await prisma.event.findFirst({
        where: { name: "Tech Networking Night" },
    })

    if (!event) throw new Error("Event not found")

    const assets = await prisma.asset.findMany({
        take: 2,
    })

    if (!assets.length) throw new Error("No assets found")

    for (const asset of assets) {
        const existing = await prisma.eventAsset.findUnique({
            where: {
                eventId_assetId: {
                    eventId: event.id,
                    assetId: asset.id,
                },
            },
        })

        if (!existing) {
            await prisma.eventAsset.create({
                data: {
                    eventId: event.id,
                    assetId: asset.id,
                    quantity: 1,
                },
            })
        }
    }
}
