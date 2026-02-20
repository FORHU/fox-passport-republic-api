import { PrismaClient } from "@prisma/client"

export async function seedEventServices(prisma: PrismaClient) {
    const event = await prisma.event.findFirst({
        where: { name: "Tech Networking Night" },
    })

    if (!event) throw new Error("Event not found")

    const services = await prisma.service.findMany({
        take: 2,
    })

    if (!services.length) throw new Error("No services found")

    for (const service of services) {
        const existing = await prisma.eventService.findFirst({
            where: {
                eventId: event.id,
                serviceId: service.id,
            },
        })

        if (!existing) {
            await prisma.eventService.create({
                data: {
                    eventId: event.id,
                    serviceId: service.id,
                    agreedPrice: service.price ?? 10000, // fallback
                },
            })
        }
    }
}
