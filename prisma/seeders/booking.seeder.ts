import { PrismaClient, BookingStatus } from "@prisma/client"

export async function seedBooking(prisma: PrismaClient) {
    const event = await prisma.event.findFirst({
        where: { name: "Tech Networking Night" },
    })

    if (!event) {
        console.warn("Event 'Tech Networking Night' not found, skipping booking seed")
        return
    }

    const user = await prisma.user.findUnique({
        where: { email: "user@app.com" },
    })

    if (!user) {
        console.warn("User 'user@app.com' not found, skipping booking seed")
        return
    }

    const existingBooking = await prisma.booking.findFirst({
        where: { eventId: event.id, userId: user.id },
    })

    if (!existingBooking) {
        await prisma.booking.create({
            data: {
                eventId: event.id,
                userId: user.id,
                guestCount: 2,
                totalAmount: 1000,
                status: BookingStatus.confirmed,
                startAt: new Date(Date.now() + 86400000),
                endAt: new Date(Date.now() + 90000000),
            },
        })
    }
}
