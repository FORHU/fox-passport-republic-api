import { PrismaClient, ServiceCategory } from "@prisma/client"

export async function seedService(prisma: PrismaClient) {
    const host = await prisma.user.findUnique({
        where: { email: "host@app.com" },
    })

    if (!host) {
        throw new Error("Host user not found")
    }

    const mockServices = [
        {
            name: "Catering Service",
            description: "Full-service catering",
            category: ServiceCategory.catering,
            price: 15000,
        },
        {
            name: "Event Photography",
            description: "Professional event coverage",
            category: ServiceCategory.photography,
            price: 8000,
        },
        {
            name: "Live Band",
            description: "Entertainment for events",
            category: ServiceCategory.entertainment,
            price: 12000,
        },
    ]

    for (const service of mockServices) {
        const existing = await prisma.service.findFirst({
            where: { name: service.name },
        })

        if (!existing) {
            await prisma.service.create({
                data: {
                    ownerId: host.id,
                    name: service.name,
                    description: service.description,
                    category: service.category,
                    price: service.price,
                },
            })
        }
    }
}
