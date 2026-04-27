import { PrismaClient, AssetStatus, BillingRate, AssetCondition, AssetCategory } from "@prisma/client";

export async function seedAssets(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting asset seed...");
    const admin = users.find(u => u.email === "admin@example.com");
    if (!admin) throw new Error("Admin user not found for asset seeding");

    const assets = [
      {
        ownerId: admin.id,
        category: AssetCategory.sound_system,
        name: "Stage Speakers XL",
        description: "Professional high-output speakers",
        quantity: 4,
        price: 2000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.new,
        status: AssetStatus.available,
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        ownerId: admin.id,
        category: AssetCategory.sound_system,
        name: "LED Flood Lights",
        description: "RGB DMX controllable flood lights",
        quantity: 10,
        price: 500,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Manila",
        state: "Metro Manila",
        country: "Philippines",
      },
    ];

    for (const a of assets) {
      await prisma.asset.upsert({
        where: { id: `seed-asset-${a.name.toLowerCase().replace(/\s+/g, '-')}` },
        update: a,
        create: {
          id: `seed-asset-${a.name.toLowerCase().replace(/\s+/g, '-')}`,
          ...a
        },
      });
    }

    console.log("✅ Asset seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding assets:", error);
    throw error;
  }
}
