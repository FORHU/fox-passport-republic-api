import { PrismaClient, VenueType, VenueStatus } from "@prisma/client"

export async function seedVenue(prisma: PrismaClient) {
  const host = await prisma.user.findUnique({
    where: { email: "host@app.com" },
  })

  if (!host) {
    throw new Error("Host user not found")
  }

  const mockVenues = [
    {
      name: "Skyline Rooftop",
      description: "Premium rooftop venue",
      type: VenueType.rooftop,
      capacity: 150,
      state: "Benguet",
      city: "Baguio",
    },
    {
      name: "Emerald Garden Pavilion",
      description: "Lush garden venue perfect for weddings and outdoor events",
      type: VenueType.garden,
      capacity: 250,
      state: "Benguet",
      city: "La Trinidad",
    },
  ]

  for (const venue of mockVenues) {
    const existing = await prisma.venue.findFirst({
      where: { name: venue.name },
    })

    if (!existing) {
      await prisma.venue.create({
        data: {
          hostId: host.id,
          name: venue.name,
          description: venue.description,
          type: venue.type,
          capacity: venue.capacity,
          status: VenueStatus.published,
          address: "123 Session Road",
          city: venue.city,
          state: "Benguet",
          country: "Philippines",
          venueImages: {
            create: [
              {
                url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1a?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1170&q=80",
                altText: `${venue.name} Image`,
                orderIndex: 1,
                isThumbnail: true,
              },
            ],
          },
        },
      })
    }
  }
}
