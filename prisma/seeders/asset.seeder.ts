import { BillingRate, PrismaClient } from "@prisma/client"

export async function seedAsset(prisma: PrismaClient) {
    const host = await prisma.user.findUnique({
        where: { email: "host@app.com" },
    })

    if (!host) {
        throw new Error("Host user not found")
    }

    const mockAssets = [
        {
            name: "Sound System",
            description: "Professional audio setup for events",
            category: "Equipment",
            price: 5000,
            billingRate: BillingRate.daily,
            condition: "good",
            status: "available",
        },
        {
            name: "Lighting Rig",
            description: "Stage lighting for events",
            category: "Equipment",
            price: 3000,
            billingRate: BillingRate.daily,
            condition: "good",
            status: "available",
        },
        {
            name: "Projector",
            description: "High-resolution event projector",
            category: "Equipment",
            price: 2000,
            billingRate: BillingRate.daily,
            condition: "fair",
            status: "available",
        },
    ]

    for (const asset of mockAssets) {
        const existingAsset = await prisma.asset.findFirst({
            where: { name: asset.name },
        })

        if (!existingAsset) {
            await prisma.asset.create({
                data: {
                    ownerId: host.id,
                    name: asset.name,
                    description: asset.description,
                    category: asset.category,
                    price: asset.price,
                    billingRate: asset.billingRate as BillingRate,
                    condition: asset.condition as any,
                    status: asset.status as any,
                },
            })
        }
    }
}
