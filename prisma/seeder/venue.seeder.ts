import { PrismaClient, VenueStatus, BillingRate, VenueCategory } from "@prisma/client";

export async function seedVenues(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting venue seed...");
    const host = users.find(u => u.email === "mayor@example.com");
    if (!host) throw new Error("Mayor user not found for venue seeding");

    const venues = [
      {
        hostId: host.id,
        name: "Grand Palace Hall",
        description: "A luxury hall for large events and grand celebrations.",
        category: VenueCategory.indoor,
        capacity: 500,
        price: 50000,
        billingRate: BillingRate.daily,
        address: "123 Palace Way",
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
        status: VenueStatus.available,
        spaceType: ["ballroom", "hall"],
        amenities: ["air conditioning", "parking", "restrooms", "catering kitchen"],
        techAv: ["projector", "sound system", "microphone"],
        staffing: ["security", "janitor"],
        policies: ["no smoking", "no outside food", "venue hours 6am-12am"],
      },
      {
        hostId: host.id,
        name: "Garden Gazebo",
        description: "A beautiful outdoor garden space perfect for intimate gatherings.",
        category: VenueCategory.garden,
        capacity: 50,
        price: 5000,
        billingRate: BillingRate.hourly,
        address: "123 Palace Way",
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
        status: VenueStatus.available,
        spaceType: ["garden", "outdoor"],
        amenities: ["restrooms", "garden lighting"],
        techAv: ["bluetooth speaker"],
        staffing: ["gardener"],
        policies: ["no smoking", "venue hours 7am-10pm"],
      },
      {
        hostId: host.id,
        name: "Boracay Beach Resort",
        description: "Stunning beachfront venue with panoramic ocean views.",
        category: VenueCategory.beach_resort,
        capacity: 200,
        price: 75000,
        billingRate: BillingRate.daily,
        address: "White Beach Station 1",
        city: "Boracay",
        state: "Aklan",
        country: "Philippines",
        status: VenueStatus.available,
        spaceType: ["beach", "outdoor", "reception area"],
        amenities: ["pool", "parking", "restrooms", "bar"],
        techAv: ["sound system", "outdoor screen"],
        staffing: ["security", "lifeguard"],
        policies: ["no glass on beach", "no smoking in rooms"],
      },
      {
        hostId: host.id,
        name: "The Loft BGC",
        description: "Trendy rooftop loft in the heart of Bonifacio Global City.",
        category: VenueCategory.indoor,
        capacity: 120,
        price: 20000,
        billingRate: BillingRate.daily,
        address: "5th Ave corner 26th St",
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        status: VenueStatus.available,
        spaceType: ["rooftop", "loft", "indoor"],
        amenities: ["air conditioning", "elevator", "restrooms", "bar area"],
        techAv: ["projector", "sound system", "LED walls"],
        staffing: ["security", "concierge"],
        policies: ["no outside alcohol", "venue hours 10am-2am"],
      },
      // ── Pending (awaiting admin approval) ──────────────────────────────────
      {
        hostId: host.id,
        name: "Casa Veranda Tagaytay",
        description: "Scenic hillside events venue overlooking Taal Lake.",
        category: VenueCategory.outdoor,
        capacity: 150,
        price: 35000,
        billingRate: BillingRate.daily,
        address: "Km 58 Aguinaldo Highway",
        city: "Tagaytay",
        state: "Cavite",
        country: "Philippines",
        status: VenueStatus.pending,
        spaceType: ["garden", "outdoor", "veranda"],
        amenities: ["parking", "restrooms", "catering kitchen", "bridal suite"],
        techAv: ["sound system", "projector"],
        staffing: ["security", "event coordinator"],
        policies: ["no confetti", "venue hours 8am-10pm"],
      },
      {
        hostId: host.id,
        name: "Skyline Function Hall Cebu",
        description: "Modern events hall with panoramic city views in Cebu Business Park.",
        category: VenueCategory.indoor,
        capacity: 300,
        price: 45000,
        billingRate: BillingRate.daily,
        address: "Cebu Business Park",
        city: "Cebu City",
        state: "Cebu",
        country: "Philippines",
        status: VenueStatus.pending,
        spaceType: ["function hall", "indoor"],
        amenities: ["air conditioning", "parking", "restrooms", "bar"],
        techAv: ["full AV system", "LED screen", "live stream setup"],
        staffing: ["security", "janitor", "front desk"],
        policies: ["no outside food", "venue hours 7am-12am"],
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
