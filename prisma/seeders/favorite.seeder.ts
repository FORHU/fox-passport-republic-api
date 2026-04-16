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

  if (event) {
    favorites.push({
      userId: user.id,
      entityId: event.id,
      entityType: "event",
    })
  }

  if (venue) {
    favorites.push({
      userId: user.id,
      entityId: venue.id,
      entityType: "venue",
    })
  }

  if (favorites.length > 0) {
    for (const fav of favorites) {
      await prisma.favorite.create({
        data: fav,
      })
    }
  }
}
