import { PrismaClient } from "@prisma/client"

export async function seedAsset(prisma: PrismaClient) {
    const host = await prisma.user.findUnique({
        where: { email: "host@app.com" },
    })

    if (!host) {
        throw new Error("Host user not found")
    }

    const category = await prisma.category.findUnique({
        where: { slug: "equipment" },
    })

    if (!category) {
        throw new Error("Category 'equipment' not found")
    }

    const mockAssets = [
        {
            name: "Sound System",
            description: "Professional audio setup",
            imageUrl: "https://picsum.photos/400/300?1",
        },
        {
            name: "Lighting Rig",
            description: "Stage lighting for events",
            imageUrl: "https://picsum.photos/400/300?2",
        },
        {
            name: "Projector",
            description: "High-resolution event projector",
            imageUrl: "https://picsum.photos/400/300?3",
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
                    hostId: host.id,
                    categoryId: category.id,
                    name: asset.name,
                    description: asset.description,
                    propertyType: "Equipment",
                    roomType: "Equipment",
                    capacity: 10,
                    maxAttendees: 10,
                    assetImages: {
                        create: [
                            {
                                url: asset.imageUrl,
                                altText: `${asset.name} Image`,
                                isThumbnail: true,
                                orderIndex: 1,
                            },
                        ],
                    },
                },
            })
        }
    }
}
