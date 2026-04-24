import { PrismaClient, ServiceStatus, BillingRate } from "@prisma/client";

export async function seedServices(prisma: PrismaClient, owners: any[]) {
  console.log("Seeding Services...");

  const services = [
    {
      name: "Luxury Catering",
      description: "5-course meals for weddings and galas.",
      category: "Catering",
      city: "Makati",
      country: "Philippines",
      price: 1500,
      billingRate: BillingRate.one_time,
      tags: ["Food", "Fine Dining"],
      status: ServiceStatus.available,
      ownerId: owners.find(o => o.email === "service@foxpassport.com")?.id || owners[0].id,
    },
    {
      name: "Pro Photography",
      description: "High-resolution event photography.",
      category: "Media",
      city: "Quezon City",
      country: "Philippines",
      price: 5000,
      billingRate: BillingRate.daily,
      tags: ["Photos", "Video"],
      status: ServiceStatus.available,
      ownerId: owners.find(o => o.email === "service@foxpassport.com")?.id || owners[0].id,
    }
  ];

  for (const service of services) {
    await prisma.service.create({
      data: service
    });
  }
}
