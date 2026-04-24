import { PrismaClient, VenueStatus, BillingRate } from "@prisma/client";

export async function seedVenues(prisma: PrismaClient, hosts: any[]) {
  console.log("Seeding Venues...");

  const venues = [
    {
      name: "Grand Ballroom",
      description: "A luxury ballroom for high-end events.",
      category: "Event Hall",
      capacity: 500,
      price: 25000,
      address: "123 Elite St",
      city: "Makati",
      country: "Philippines",
      spaceType: ["Indoor", "Ballroom"],
      amenities: ["AC", "WiFi", "Sound System"],
      techAv: ["Projector", "Large Screen"],
      staffing: ["Security", "Cleaners"],
      policies: ["No Smoking", "No Outside Food"],
      status: VenueStatus.available,
      billingRate: BillingRate.daily,
      hostId: hosts.find(h => h.email === "host@foxpassport.com")?.id || hosts[0].id,
    },
    {
      name: "Sunny Garden",
      description: "Outdoor garden perfect for weddings.",
      category: "Garden",
      capacity: 200,
      price: 15000,
      address: "456 Bloom Ave",
      city: "Quezon City",
      country: "Philippines",
      spaceType: ["Outdoor"],
      amenities: ["Tables", "Chairs"],
      techAv: ["Basic Sound"],
      staffing: ["Gardeners"],
      policies: ["Pets Allowed"],
      status: VenueStatus.available,
      billingRate: BillingRate.daily,
      hostId: hosts.find(h => h.email === "host@foxpassport.com")?.id || hosts[0].id,
    }
  ];

  for (const venue of venues) {
    await prisma.venue.create({
      data: venue
    });
  }
}
