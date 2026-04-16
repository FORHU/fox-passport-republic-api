import { BillingRate, PrismaClient } from "@prisma/client"

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
            description: "Full-service catering with organic options",
            category: "Catering",
            price: 15000,
            billingRate: BillingRate.one_time,
            status: "available",
        },
        {
            name: "Event Photography",
            description: "Professional event coverage and video editing",
            category: "Photography",
            price: 8000,
            billingRate: BillingRate.daily,
            status: "available",
        },
        {
            name: "Live Band",
            description: "Entertainment for events ranging from jazz to rock",
            category: "Entertainment",
            price: 12000,
            billingRate: BillingRate.daily,
            status: "available",
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
                    billingRate: service.billingRate,
                    status: service.status as any,
                },
            })
        }
    }
}
