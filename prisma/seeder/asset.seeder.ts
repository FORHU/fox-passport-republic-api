import { PrismaClient, AssetStatus, BillingRate, AssetCondition, AssetCategory } from "@prisma/client";

export async function seedAssets(prisma: PrismaClient, users: any[]) {
  try {
    console.log("Starting asset seed...");
    const gearFoxer = users.find(u => u.email === "gearfoxer@example.com");
    if (!gearFoxer) throw new Error("Gear foxer user not found for asset seeding");

    const assets = [
      {
        ownerId: gearFoxer.id,
        category: AssetCategory.sound_system,
        name: "Stage Speakers XL",
        description: "Professional high-output line array speakers, ideal for 200+ person events.",
        quantity: 4,
        price: 2000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.new,
        status: AssetStatus.available,
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        ownerId: gearFoxer.id,
        category: AssetCategory.sound_system,
        name: "LED Flood Lights RGB",
        description: "DMX-controllable RGB flood lights for stage and ambient lighting.",
        quantity: 10,
        price: 500,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        ownerId: gearFoxer.id,
        category: AssetCategory.decorations,
        name: "Floral Arch Setup",
        description: "Elegant floral arch with customizable color arrangements.",
        quantity: 2,
        price: 3500,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        ownerId: gearFoxer.id,
        category: AssetCategory.furnitures,
        name: "Tiffany Chairs (Set of 50)",
        description: "Classic Tiffany chiavari chairs, perfect for banquets and weddings.",
        quantity: 50,
        price: 1500,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
      },
      // ── Pending (awaiting admin approval) ──────────────────────────────────
      {
        ownerId: gearFoxer.id,
        category: AssetCategory.sound_system,
        name: "Wireless Lavalier Mic Set",
        description: "Professional 4-channel wireless lavalier microphone system.",
        quantity: 4,
        price: 1200,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.new,
        status: AssetStatus.pending,
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
      },
      {
        ownerId: gearFoxer.id,
        category: AssetCategory.decorations,
        name: "Neon Sign - Custom Text",
        description: "Custom LED neon signs for photo walls and event branding.",
        quantity: 3,
        price: 2500,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.new,
        status: AssetStatus.pending,
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
      },
    ];

    for (const a of assets) {
      await prisma.asset.upsert({
        where: { id: `seed-asset-${a.name.toLowerCase().replace(/\s+/g, '-')}` },
        update: { ...a },
        create: {
          id: `seed-asset-${a.name.toLowerCase().replace(/\s+/g, '-')}`,
          ...a,
        },
      });
      console.log(`✓ Seeded asset: ${a.name}`);
    }

    console.log("✅ Asset seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding assets:", error);
    throw error;
  }
}
