import { PrismaClient, ServiceStatus, BillingRate } from "@prisma/client";

export async function seedServices(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting service seed...");
    const admin = users.find(u => u.email === "admin@example.com");
    if (!admin) throw new Error("Admin user not found for service seeding");

    const services = [
      {
        ownerId: admin.id,
        category: "Photography",
        name: "Full Day Photography",
        description: "Professional wedding and event photography",
        price: 15000,
        currency: "PHP",
        billingRate: BillingRate.one_time,
        status: ServiceStatus.available,
      },
      {
        ownerId: admin.id,
        category: "Catering",
        name: "Premium Buffet Service",
        description: "Gourmet catering for 100+ guests",
        price: 800,
        currency: "PHP",
        billingRate: BillingRate.daily, // assuming price per head handled differently but using billingRate for now
        status: ServiceStatus.available,
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
