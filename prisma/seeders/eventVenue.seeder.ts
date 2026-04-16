import { BillingRate, PrismaClient, TransactionStatus } from "@prisma/client"

export async function seedEventVenue(prisma: PrismaClient) {
    const event = await prisma.event.findFirst({
        where: { name: "Tech Networking Night" },
    })

    const venue = await prisma.venue.findFirst({
        where: { name: "Skyline Rooftop" },
    })

    if (!event || !venue) return

    await prisma.eventVenue.upsert({
        where: {
            eventId_venueId: {
                eventId: event.id,
                venueId: venue.id,
            },
        },
        update: {},
        create: {
            eventId: event.id,
            venueId: venue.id,
            agreedPrice: venue.price,
            billingRate: BillingRate.daily,
            status: TransactionStatus.approved,
        },
  })
}
