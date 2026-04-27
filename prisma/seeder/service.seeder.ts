import { PrismaClient, ServiceStatus, BillingRate, ServiceCategory } from "@prisma/client";

export async function seedServices(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting service seed...");
    const admin = users.find(u => u.email === "admin@example.com");
    if (!admin) throw new Error("Admin user not found for service seeding");

    const services = [
      {
        ownerId: admin.id,
        category: ServiceCategory.entertainment,
        name: "Manila Event Photography",
        description: "Professional event photography in Manila",
        price: 15000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        ownerId: admin.id,
        category: ServiceCategory.catering,
        name: "Cebu Premium Catering",
        description: "Gourmet catering based in Cebu",
        price: 800,
        currency: "PHP",
        billingRate: BillingRate.daily,
        status: ServiceStatus.available,
        city: "Cebu City",
        state: "Cebu",
        country: "Philippines",
      },
      {
        ownerId: admin.id,
        category: ServiceCategory.entertainment,
        name: "US Based DJ Service",
        description: "International DJ for global events",
        price: 2000,
        currency: "USD",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
        city: "New York",
        state: "New York",
        country: "USA",
      },
    ];

    for (const s of services) {
      await prisma.service.upsert({
        where: { id: `seed-service-${s.name.toLowerCase().replace(/\s+/g, '-')}` },
        update: s,
        create: {
          id: `seed-service-${s.name.toLowerCase().replace(/\s+/g, '-')}`,
          ...s
        },
      });
    }

    console.log("✅ Service seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding services:", error);
    throw error;
  }
}
