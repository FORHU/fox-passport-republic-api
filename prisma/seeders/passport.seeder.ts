import { PrismaClient } from "@prisma/client"

export async function seedPassport(prisma: PrismaClient) {
    const user = await prisma.user.findUnique({
        where: { email: "user@app.com" },
    })

    if (!user) {
        throw new Error("User 'user@app.com' not found")
    }

    return prisma.passport.upsert({
        where: { userId: user.id },
        update: {},
        create: {
            userId: user.id,
            totalStamps: 5,
            totalMileage: 120,
            achievements: ["XLR", "AUX", "MIDI"],

        },
    })
}
