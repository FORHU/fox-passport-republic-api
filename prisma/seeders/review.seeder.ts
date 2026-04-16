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

    const reviews = []

    if (event) {
        reviews.push({
            userId: user.id,
            rating: 5,
            comment: "Amazing event experience!",
            entityId: event.id,
            entityType: "event",
        })
    }

    for (const review of reviews) {
        const existing = await prisma.review.findUnique({
            where: {
                userId_entityId_entityType: {
                    userId: review.userId,
                    entityId: review.entityId,
                    entityType: review.entityType,
                },
            },
        })

        if (!existing) {
            await prisma.review.create({
                data: review,
            })
        }
    }
}
