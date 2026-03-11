import { PrismaClient } from "@prisma/client"

export async function seedReviews(prisma: PrismaClient) {
    const user = await prisma.user.findUnique({
        where: { email: "user@app.com" },
    })

    if (!user) {
        throw new Error("User 'user@app.com' not found")
    }

    const event = await prisma.event.findFirst({
        where: { name: "Tech Networking Night" },
    })

    const venue = await prisma.venue.findFirst({
        where: { name: "Skyline Rooftop" },
    })

    const reviewsToCreate = []

    if (event) {
        reviewsToCreate.push({
            userId: user.id,
            rating: 5,
            comment: "Amazing event experience!",
            eventId: event.id,
            venueId: venue?.id,
            isVerifiedAttendee: true,
        })
    }

    for (const review of reviewsToCreate) {
        const existing = await prisma.review.findFirst({
            where: {
                userId: review.userId,
                eventId: review.eventId ?? undefined,
                venueId: review.venueId ?? undefined,
            },
        })

        if (!existing) {
            await prisma.review.create({
                data: {
                    userId: review.userId,
                    rating: review.rating,
                    comment: review.comment,
                    eventId: review.eventId,
                    venueId: review.venueId,
                    isVerifiedAttendee: review.isVerifiedAttendee,
                },
            })
        }
    }
}
