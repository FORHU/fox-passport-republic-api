import { PrismaClient, AssetStatus, BillingRate, AssetCondition } from "@prisma/client";

export async function seedAssets(prisma: PrismaClient, owners: any[]) {
  console.log("Seeding Assets...");

  const assets = [
    {
      name: "Pro Sound System",
      description: "Complete audio setup for concerts.",
      category: "Audio",
      quantity: 5,
      price: 5000,
      billingRate: BillingRate.daily,
      condition: AssetCondition.new,
      status: AssetStatus.available,
      ownerId: owners.find(o => o.email === "asset@foxpassport.com")?.id || owners[0].id,
    },
    {
      name: "RGB Stage Lights",
      description: "Intelligent lighting for performances.",
      category: "Lighting",
      quantity: 20,
      price: 200,
      billingRate: BillingRate.daily,
      condition: AssetCondition.good,
      status: AssetStatus.available,
      ownerId: owners.find(o => o.email === "asset@foxpassport.com")?.id || owners[0].id,
    }
  ];

  for (const asset of assets) {
    await prisma.asset.create({
      data: asset
    });
  }
}
