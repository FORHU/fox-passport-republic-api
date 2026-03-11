import {
    PrismaClient,
    BookingStatus,
    PaymentStatus,
} from "@prisma/client"

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

    const existingBooking = await prisma.booking.findUnique({
        where: { confirmationCode: "CONF123" },
    })

    if (!existingBooking) {
        await prisma.booking.create({
            data: {
                eventId: event.id,
                userId: user.id,
                guestCount: 2,
                totalAmount: 1000,
                status: BookingStatus.confirmed,
                confirmationCode: "CONF123",
                specialRequests: "Special requests",
                expiresAt: new Date(),

                payments: {
                    create: {
                        amount: 1000,
                        currency: "PHP",
                        paymentMethod: "GCash",
                        paymentStatus: PaymentStatus.completed,
                    },
                },

                attendees: {
                    create: [
                        {
                            firstName: "Juan",
                            lastName: "Dela Cruz",
                            email: "juan@email.com",
                            ticketCode: "TICKET1",
                            phone: "1234567890",
                            checkedIn: true,
                            checkInTime: new Date(),
                        },
                        {
                            firstName: "Maria",
                            lastName: "Santos",
                            email: "maria@email.com",
                            ticketCode: "TICKET2",
                            phone: "1234567890",
                            checkedIn: true,
                            checkInTime: new Date(),
                        },
                    ],
                },
            },
        })
    }
}
