import { PrismaClient, EventType, EventStatus } from "@prisma/client"

export async function seedEvent(prisma: PrismaClient) {
    const venue = await prisma.venue.findFirst({
        where: { name: "Skyline Rooftop" },
    })

    if (!venue) {
        throw new Error("Venue 'Skyline Rooftop' not found")
    }

    const host = await prisma.user.findUnique({
        where: { email: "host@app.com" },
    })

    if (!host) {
        throw new Error("Host 'host@app.com' not found")
    }

    const mockEvents = [
        {
            name: "Tech Networking Night",
            description: "Exclusive networking event for tech professionals in Baguio.",
        },
    ]

    for (const event of mockEvents) {
        const existing = await prisma.event.findFirst({
            where: { name: event.name },
        })

        if (!existing) {
            await prisma.event.create({
                data: {
                    venueId: venue.id,
                    organizerId: host.id,
                    name: event.name,
                    description: event.description,
                    eventType: EventType.corporate,
                    startAt: new Date(Date.now() + 86400000),
                    endAt: new Date(Date.now() + 90000000),
                    maxAttendees: 100,
                    totalPrice: 50000,
                    status: EventStatus.pending,
                },
            })
        }
    }
}
