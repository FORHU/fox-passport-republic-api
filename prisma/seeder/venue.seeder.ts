import { PrismaClient, VenueStatus, BillingRate, VenueCategory } from "@prisma/client";

export async function seedVenues(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting venue seed...");
    const host = users.find(u => u.email === "host@example.com");
    if (!host) throw new Error("Host user not found for venue seeding");

    const venues = [
      {
        hostId: host.id,
        name: "Grand Palace Hall",
        description: "A luxury hall for large events.",
        category: VenueCategory.indoor,
        capacity: 500,
        price: 50000,
        billingRate: BillingRate.daily,
        address: "123 Palace Way",
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
        status: VenueStatus.available,
      },
      {
        hostId: host.id,
        name: "Garden Gazebo",
        description: "A beautiful outdoor garden space.",
        category: VenueCategory.garden,
        capacity: 50,
        price: 5000,
        billingRate: BillingRate.hourly,
        address: "123 Palace Way",
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
        status: VenueStatus.available,
      },
      {
        hostId: host.id,
        name: "Boracay Beach Resort",
        description: "Stunning beach front venue.",
        category: VenueCategory.beach_resort,
        capacity: 200,
        price: 75000,
        billingRate: BillingRate.daily,
        address: "White Beach Station 1",
        city: "Boracay",
        state: "Aklan",
        country: "Philippines",
        status: VenueStatus.available,
      },
      {
        hostId: host.id,
        name: "Silicon Valley Studio",
        description: "Modern studio for tech meetups.",
        category: VenueCategory.indoor,
        capacity: 100,
        price: 1500,
        billingRate: BillingRate.hourly,
        address: "101 Infinite Loop",
        city: "Cupertino",
        state: "California",
        country: "USA",
        status: VenueStatus.available,
      },
    ];

    for (const v of venues) {
      await prisma.venue.upsert({
        where: { id: `seed-venue-${v.name.toLowerCase().replace(/\s+/g, '-')}` }, // deterministic ID for seeding
        update: v,
        create: {
          id: `seed-venue-${v.name.toLowerCase().replace(/\s+/g, '-')}`,
          ...v
        },
      });
    }

    console.log("✅ Venue seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding venues:", error);
    throw error;
  }
}
