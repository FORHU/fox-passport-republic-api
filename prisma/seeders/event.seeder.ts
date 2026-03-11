import { PrismaClient, EventType, EventStatus } from "@prisma/client"

export async function seedEvent(prisma: PrismaClient) {
    const venue = await prisma.venue.findFirst({
        where: { name: "Skyline Rooftop" },
    })

    if (!venue) {
        throw new Error("Venue 'Skyline Rooftop' not found")
    }

    const organizer = await prisma.user.findUnique({
        where: { email: "admin@app.com" },
    })

    if (!organizer) {
        throw new Error("Organizer 'admin@app.com' not found")
    }

    const mockEvents = [
        {
            name: "Tech Networking Night",
            description: "Exclusive networking event",
        },
    ]

    for (const event of mockEvents) {
        let eventId = 0
        const existing = await prisma.event.findFirst({
            where: { name: event.name },
        })

        if (!existing) {
            const created = await prisma.event.create({
                data: {
                    venueId: venue.id,
                    organizerId: organizer.id,
                    name: event.name,
                    description: event.description,
                    eventType: EventType.corporate,
                    startDatetime: new Date(Date.now() + 86400000),
                    endDatetime: new Date(Date.now() + 90000000),
                    maxAttendees: 100,
                    totalPrice: 50000,
                    status: EventStatus.published,
                },
            })
            eventId = created.id
        } else {
            eventId = existing.id
        }

        // Seed Event Assets
        const assets = await prisma.asset.findMany({
            where: { name: { in: ["Sound System", "Projector"] } },
        })

        for (const asset of assets) {
            await prisma.eventAsset.upsert({
                where: {
                    eventId_assetId: {
                        eventId,
                        assetId: asset.id,
                    },
                },
                update: {},
                create: {
                    eventId,
                    assetId: asset.id,
                    quantity: 1,
                },
            })
        }

        // Seed Event Services
        const services = await prisma.service.findMany({
            take: 2,
        })

        for (const service of services) {
            await prisma.eventService.upsert({
                where: {
                    eventId_serviceId: {
                        eventId,
                        serviceId: service.id,
                    },
                },
                update: {},
                create: {
                    eventId,
                    serviceId: service.id,
                    agreedPrice: service.price ?? 10000,
                },
            })
        }
    }
}
