import { PrismaClient } from "@prisma/client"

export async function seedFavorite(prisma: PrismaClient) {
  const user = await prisma.user.findUnique({
    where: { email: "user@app.com" },
  })

  if (!user) throw new Error("User 'user@app.com' not found")

  const event = await prisma.event.findFirst({
    where: { name: "Tech Networking Night" },
  })

  const venue = await prisma.venue.findFirst({
    where: { name: "Skyline Rooftop" },
  })

  const favorites = []

  const now = new Date()

  // Only pass the relevant field, plus timestamps
  if (event) {
    favorites.push({
      userId: user.id,
      venueId: venue?.id,
      eventId: event.id,
      savedAt: now,
      createdAt: now,
      updatedAt: now,
    })
  }

  if (favorites.length > 0) {
    await prisma.favorite.createMany({
      data: favorites,
      skipDuplicates: true, // prevents unique constraint errors
    })
  }
}
