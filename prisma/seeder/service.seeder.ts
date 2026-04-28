import { PrismaClient, ServiceStatus, BillingRate, ServiceCategory } from "@prisma/client";

export async function seedServices(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting service seed...");
    const serviceFoxer = users.find(u => u.email === "servicefoxer@example.com");
    if (!serviceFoxer) throw new Error("Service foxer user not found for service seeding");

    const services = [
      {
        ownerId: serviceFoxer.id,
        category: ServiceCategory.entertainment,
        name: "Manila Event Photography",
        description: "Professional event photography and videography coverage in Metro Manila.",
        price: 15000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["photography", "videography", "events"],
        isWillingToTravel: true,
      },
      {
        ownerId: serviceFoxer.id,
        category: ServiceCategory.catering,
        name: "Metro Manila Premium Catering",
        description: "Full-service gourmet catering with Filipino and international cuisine.",
        price: 800,
        currency: "PHP",
        billingRate: BillingRate.daily,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["catering", "food", "buffet"],
        isWillingToTravel: true,
      },
      {
        ownerId: serviceFoxer.id,
        category: ServiceCategory.entertainment,
        name: "Live Band Performance",
        description: "5-piece live band covering OPM, pop, and jazz for corporate and social events.",
        price: 25000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["band", "live music", "entertainment"],
        isWillingToTravel: true,
      },
      {
        ownerId: serviceFoxer.id,
        category: ServiceCategory.service_staff,
        name: "Event Waitstaff Team",
        description: "Trained and uniformed waitstaff for banquets and cocktail events.",
        price: 600,
        currency: "PHP",
        billingRate: BillingRate.daily,
        status: ServiceStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["staff", "waiters", "service"],
        isWillingToTravel: false,
      },
      // ── Pending (awaiting admin approval) ──────────────────────────────────
      {
        ownerId: serviceFoxer.id,
        category: ServiceCategory.design,
        name: "Event Styling & Design",
        description: "Full event styling and design service — concept to setup.",
        price: 18000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.pending,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        tags: ["styling", "design", "decor"],
        isWillingToTravel: true,
      },
      {
        ownerId: serviceFoxer.id,
        category: ServiceCategory.catering,
        name: "Cebu Lechon & Kamayan",
        description: "Authentic Cebu lechon and traditional kamayan feast catering.",
        price: 1200,
        currency: "PHP",
        billingRate: BillingRate.daily,
        status: ServiceStatus.pending,
        city: "Cebu City",
        state: "Cebu",
        country: "Philippines",
        tags: ["lechon", "kamayan", "filipino food"],
        isWillingToTravel: false,
      },
    ];

    for (const s of services) {
      await prisma.service.upsert({
        where: { id: `seed-service-${s.name.toLowerCase().replace(/\s+/g, '-')}` },
        update: { ...s },
        create: {
          id: `seed-service-${s.name.toLowerCase().replace(/\s+/g, '-')}`,
          ...s,
        },
      });
      console.log(`✓ Seeded service: ${s.name}`);
    }

    console.log("✅ Service seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding services:", error);
    throw error;
  }
}
