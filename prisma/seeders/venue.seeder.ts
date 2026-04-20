import { PrismaClient, VenueStatus } from "@prisma/client"

export async function seedVenue(prisma: PrismaClient) {

  try {
    const host = await prisma.user.findFirst({
      where: { email: "host@app.com" },
    })

    if (!host) {
      return
    }

    const mockVenues = [
      {
        name: "Skyline Rooftop",
        description: "Premium rooftop venue with a stunning view of Baguio City.",
        category: "Rooftop",
        capacity: 150,
        address: "123 Session Road",
        city: "Baguio",
        state: "Benguet",
        country: "Philippines",
        spaceType: ["PoolSide", "Outdoor"],
        amenities: ["WiFi", "Parking", "Bar", "Restrooms"],
        techAv: ["Free WiFi", "Projector", "Sound System"],
        staffing: ["Cleaning Lady", "Security", "Event Staff"],
        policies: ["No Smoking", "No Pets"],
        price: 10000,
        status: VenueStatus.available,
      },
      {
        name: "Emerald Garden Pavilion",
        description: "Lush garden venue perfect for weddings and outdoor events.",
        category: "Garden",
        capacity: 250,
        address: "Kilometer 5, Balili",
        city: "La Trinidad",
        state: "Benguet",
        country: "Philippines",
        spaceType: ["Indoor", "Rooftop"],
        amenities: ["WiFi", "Parking", "Restrooms"],
        techAv: ["Microphones", "Display Screen"],
        staffing: ["Cleaning Lady", "Security"],
        policies: ["No Smoking", "No Alcohol"],
        price: 100,
        status: VenueStatus.available,
      },
    ]

    for (const v of mockVenues) {

      const existing = await prisma.venue.findFirst({
        where: { name: v.name },
      })

      if (!existing) {
        await prisma.venue.create({
          data: {
            hostId: host.id,
            name: v.name,
            description: v.description,
            category: v.category,
            capacity: v.capacity,
            status: v.status,
            address: v.address,
            city: v.city,
            state: v.state,
            country: v.country,
            spaceType: v.spaceType,
            amenities: v.amenities,
            techAv: v.techAv,
            staffing: v.staffing,
            policies: v.policies,
            price: v.price,
          },
        })
      }
    }
  } catch (error) {
    throw error
  }
}
