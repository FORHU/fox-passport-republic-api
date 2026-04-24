import { PrismaClient, VenueStatus, BillingRate } from "@prisma/client";

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
        category: "wedding",
        capacity: 500,
        price: 50000,
        billingRate: BillingRate.daily,
        address: "123 Palace Way",
        city: "Manila",
        country: "Philippines",
        status: VenueStatus.available,
      },
      {
        hostId: host.id,
        name: "Garden Gazebo",
        description: "A beautiful outdoor garden space.",
        category: "other",
        capacity: 50,
        price: 5000,
        billingRate: BillingRate.hourly,
        address: "123 Palace Way",
        city: "Manila",
        country: "Philippines",
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
