import {
  PrismaClient,
  VenueStatus,
  BillingRate,
  VenueCategory,
  AssetStatus,
  AssetCategory,
  AssetCondition,
} from "@prisma/client";
import crypto from "crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, 1000, 64, "sha512")
    .toString("hex");
  return `${salt}:${hash}`;
}

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Makati: { lat: 14.5547, lng: 121.0244 },
  Taguig: { lat: 14.5176, lng: 121.0509 },
  "Quezon City": { lat: 14.676, lng: 121.0437 },
  Manila: { lat: 14.5995, lng: 120.9842 },
  Pasig: { lat: 14.5764, lng: 121.0851 },
  Tagaytay: { lat: 14.1152, lng: 120.9624 },
};

export async function seedPartners(prisma: PrismaClient) {
  try {
    console.log("Starting partner seed...");

    // ── Partner User (all four foxer roles) ──────────────────────────────────
    const partner = await prisma.user.upsert({
      where: { email: "partner@example.com" },
      update: {
        name: "Fox Partner",
        username: "fox_partner",
        systemRole: "user" as any,
        roleType: [
          "venueFoxer",
          "eventFoxer",
          "gearFoxer",
          "serviceFoxer",
        ] as any,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
      },
      create: {
        email: "partner@example.com",
        password: hashPassword("Partner1234567890!"),
        name: "Fox Partner",
        username: "fox_partner",
        systemRole: "user" as any,
        roleType: [
          "venueFoxer",
          "eventFoxer",
          "gearFoxer",
          "serviceFoxer",
        ] as any,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
      },
    });
    console.log(
      `✓ Partner user: ${partner.email} — roles: [venueFoxer, eventFoxer, gearFoxer, serviceFoxer]`,
    );

    // Also promote multirole user to include gearFoxer
    await prisma.user
      .update({
        where: { email: "multirole@example.com" },
        data: {
          roleType: [
            "eventFoxer",
            "venueFoxer",
            "gearFoxer",
            "serviceFoxer",
          ] as any,
        },
      })
      .catch(() => {
        // Silently skip if multirole user doesn't exist yet
      });

    // ── Partner-Owned Venues ──────────────────────────────────────────────────
    const venues = [
      {
        id: "seed-venue-partner-studio-makati",
        name: "Partner Creative Studio",
        description:
          "Modern intimate studio in Makati ideal for corporate workshops, pop-up shows, and product launches.",
        category: VenueCategory.indoor,
        capacity: 60,
        price: 14000,
        billingRate: BillingRate.daily,
        address: "Valero Street",
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        status: VenueStatus.available,
        spaceType: ["studio", "indoor"],
        amenities: ["air conditioning", "restrooms", "prep kitchen", "wifi"],
        techAv: ["4K projector", "PA system", "wireless mics", "streaming kit"],
        staffing: ["security"],
        policies: ["no smoking", "venue hours 8am-11pm"],
        ...CITY_COORDS["Makati"],
      },
      {
        id: "seed-venue-partner-garden-taguig",
        name: "Partner Garden Terrace",
        description:
          "Lush private garden terrace in BGC surrounded by curated tropical plants, perfect for intimate outdoor ceremonies.",
        category: VenueCategory.outdoor,
        capacity: 120,
        price: 22000,
        billingRate: BillingRate.daily,
        address: "5th Avenue, BGC",
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        status: VenueStatus.available,
        spaceType: ["garden", "outdoor terrace"],
        amenities: [
          "restrooms",
          "catering shelter",
          "string lights",
          "parking",
        ],
        techAv: ["outdoor PA", "ambient lighting"],
        staffing: ["security", "groundskeeper"],
        policies: ["no confetti", "venue hours 8am-10pm"],
        ...CITY_COORDS["Taguig"],
      },
      {
        id: "seed-venue-partner-rooftop-pasig",
        name: "Partner Sky Lounge",
        description:
          "Semi-enclosed rooftop lounge in Ortigas that opens to an observation deck with panoramic city views.",
        category: VenueCategory.mix,
        capacity: 100,
        price: 28000,
        billingRate: BillingRate.daily,
        address: "Ortigas Center",
        city: "Pasig",
        state: "Metro Manila",
        country: "Philippines",
        status: VenueStatus.available,
        spaceType: ["sky lounge", "rooftop deck"],
        amenities: [
          "bar counter",
          "air conditioning indoor",
          "restrooms",
          "elevator",
        ],
        techAv: ["club sound system", "LED wash lighting", "wireless mics"],
        staffing: ["security", "mixologist"],
        policies: ["no outside catering", "dress code enforced after 8pm"],
        ...CITY_COORDS["Pasig"],
      },
      {
        id: "seed-venue-partner-hall-qc",
        name: "Partner Function Hall QC",
        description:
          "Spacious banquet-style function hall in Quezon City with modular layout options for conferences and socials.",
        category: VenueCategory.indoor,
        capacity: 200,
        price: 32000,
        billingRate: BillingRate.daily,
        address: "Timog Avenue",
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
        status: VenueStatus.available,
        spaceType: ["function hall", "banquet"],
        amenities: ["air conditioning", "parking", "restrooms", "prep kitchen"],
        techAv: [
          "full AV system",
          "LED screen",
          "live stream setup",
          "wireless mics",
        ],
        staffing: ["security", "janitor"],
        policies: ["no outside food", "venue hours 7am-12am"],
        ...CITY_COORDS["Quezon City"],
      },
      {
        id: "seed-venue-partner-villa-tagaytay",
        name: "Partner Tagaytay Villa",
        description:
          "Scenic hillside villa overlooking Taal Lake, combining a cozy indoor sala with a wide garden lawn area.",
        category: VenueCategory.mix,
        capacity: 150,
        price: 40000,
        billingRate: BillingRate.daily,
        address: "Km 55 Aguinaldo Highway",
        city: "Tagaytay",
        state: "Cavite",
        country: "Philippines",
        status: VenueStatus.available,
        spaceType: ["villa", "garden lawn", "indoor sala"],
        amenities: ["parking", "restrooms", "catering kitchen", "bridal suite"],
        techAv: ["sound system", "projector", "ambient lighting"],
        staffing: ["security", "event coordinator"],
        policies: ["no confetti", "venue hours 8am-10pm"],
        ...CITY_COORDS["Tagaytay"],
      },
    ];

    for (const v of venues) {
      await prisma.venue.upsert({
        where: { id: v.id },
        update: { ...v, mayorId: partner.id },
        create: { ...v, mayorId: partner.id },
      });
      console.log(`✓ Seeded partner venue: ${v.name}`);
    }

    // ── Venue Images ───────────────────────────────────────────────────────────
    const venueImages = [
      {
        id: "img-partner-venue-studio",
        url: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800&auto=format&fit=crop",
        name: "studio.jpg",
        venueId: "seed-venue-partner-studio-makati",
      },
      {
        id: "img-partner-venue-garden",
        url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&auto=format&fit=crop",
        name: "garden.jpg",
        venueId: "seed-venue-partner-garden-taguig",
      },
      {
        id: "img-partner-venue-rooftop",
        url: "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&auto=format&fit=crop",
        name: "rooftop.jpg",
        venueId: "seed-venue-partner-rooftop-pasig",
      },
      {
        id: "img-partner-venue-hall",
        url: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&auto=format&fit=crop",
        name: "hall.jpg",
        venueId: "seed-venue-partner-hall-qc",
      },
      {
        id: "img-partner-venue-villa",
        url: "https://images.unsplash.com/photo-1499916078039-922301b0eb9b?w=800&auto=format&fit=crop",
        name: "villa.jpg",
        venueId: "seed-venue-partner-villa-tagaytay",
      },
    ];

    for (const img of venueImages) {
      await prisma.file.upsert({
        where: { id: img.id },
        update: { url: img.url },
        create: {
          id: img.id,
          name: img.name,
          type: "image/jpeg",
          url: img.url,
          venueId: img.venueId,
        },
      });
    }
    console.log(`✓ Seeded ${venueImages.length} partner venue images`);

    // ── Partner-Owned Assets (Gear + Inventory) ───────────────────────────────
    const assets = [
      // ── Equipment / Tech & AV ────────────────────────────────────
      {
        id: "seed-partner-asset-projector-4k",
        category: AssetCategory.equipment,
        name: "Partner 4K Event Projector",
        description:
          "Ultra-bright 4K laser projector, 6000 lumens — ideal for large indoor screens and daylight presentations.",
        quantity: 2,
        price: 20000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.new,
        status: AssetStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Makati"],
      },
      {
        id: "seed-partner-asset-led-screen",
        category: AssetCategory.equipment,
        name: "Partner 80-Inch LED Display",
        description:
          "Commercial-grade 4K LED panel with HDMI/USB-C inputs for sponsor slides and digital signage.",
        quantity: 2,
        price: 14000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Makati"],
      },
      {
        id: "seed-partner-asset-stage-lighting",
        category: AssetCategory.equipment,
        name: "Partner Stage Lighting Rig",
        description:
          "DMX-controlled truss with 4 moving heads, 6 LED pars, and a wireless controller — plug-and-play.",
        quantity: 1,
        price: 38000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Taguig"],
      },
      {
        id: "seed-partner-asset-streaming-rig",
        category: AssetCategory.equipment,
        name: "Partner Live Streaming Rig",
        description:
          "All-in-one hybrid event streaming kit: PTZ camera, capture card, video switcher, and encoding laptop.",
        quantity: 1,
        price: 32000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.new,
        status: AssetStatus.available,
        city: "Pasig",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Pasig"],
      },
      {
        id: "seed-partner-asset-photo-booth",
        category: AssetCategory.equipment,
        name: "Partner Selfie Photo Booth",
        description:
          "Open-air photo booth with DSLR, ring light, instant printer, and branded overlay software.",
        quantity: 1,
        price: 15000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.new,
        status: AssetStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Makati"],
      },
      // ── Sound System ──────────────────────────────────────────────
      {
        id: "seed-partner-asset-pa-system",
        category: AssetCategory.sound_system,
        name: "Partner Portable PA System",
        description:
          "2x 15-inch powered tops + 1x 18-inch subwoofer. Covers up to 150 guests with crystal-clear sound.",
        quantity: 1,
        price: 22000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Makati"],
      },
      {
        id: "seed-partner-asset-wireless-mics",
        category: AssetCategory.sound_system,
        name: "Partner Wireless Mic Set (4-channel)",
        description:
          "UHF 4-channel wireless microphone system — 2 handhelds + 2 lavaliers with clear 80m range.",
        quantity: 2,
        price: 11000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Taguig"],
      },
      // ── Furniture / Inventory ─────────────────────────────────────
      {
        id: "seed-partner-asset-banquet-tables",
        category: AssetCategory.furnitures,
        name: "Partner Banquet Tables (Set of 10)",
        description:
          "Heavy-duty 10-seater round folding tables with fitted white skirting. Perfect for banquet layouts.",
        quantity: 10,
        price: 18000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Quezon City"],
      },
      {
        id: "seed-partner-asset-chairs-100",
        category: AssetCategory.furnitures,
        name: "Partner Chiavari Chairs (100 pcs)",
        description:
          "Gold chiavari chairs with ivory cushions — elegant and stackable for any ballroom or garden event.",
        quantity: 100,
        price: 40000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Quezon City"],
      },
      {
        id: "seed-partner-asset-cocktail-tables",
        category: AssetCategory.furnitures,
        name: "Partner Cocktail Bar Tables",
        description:
          "Set of 8 high-top wooden bar tables for cocktail hours and networking setups.",
        quantity: 8,
        price: 12000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Taguig",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Taguig"],
      },
      // ── Decorations / Inventory ───────────────────────────────────
      {
        id: "seed-partner-asset-backdrop-stand",
        category: AssetCategory.decorations,
        name: "Partner Backdrop Stand Kit",
        description:
          "Adjustable metal pipe-and-drape system (3m x 2.5m) with sheer fabric panels and fairy light overlay.",
        quantity: 3,
        price: 14000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Makati"],
      },
      {
        id: "seed-partner-asset-fairy-lights",
        category: AssetCategory.decorations,
        name: "Partner Warm Fairy Light Set",
        description:
          "Set of 20 warm-white LED fairy light strands (5m each) with timer remotes for ambient décor.",
        quantity: 5,
        price: 10000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.new,
        status: AssetStatus.available,
        city: "Quezon City",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Quezon City"],
      },
      // ── Other ─────────────────────────────────────────────────────
      {
        id: "seed-partner-asset-cold-spark",
        category: AssetCategory.other,
        name: "Partner Cold Spark Machine (Pair)",
        description:
          "Indoor-safe cold spark pyrotechnic fountains — 2-unit set with wireless remote control.",
        quantity: 1,
        price: 20000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.new,
        status: AssetStatus.available,
        city: "Makati",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Makati"],
      },
      {
        id: "seed-partner-asset-generator",
        category: AssetCategory.other,
        name: "Partner Backup Generator 3kVA",
        description:
          "Silent inverter generator delivering stable clean power for AV-sensitive equipment and lighting rigs.",
        quantity: 1,
        price: 18000,
        currency: "PHP",
        billingRate: BillingRate.daily,
        condition: AssetCondition.good,
        status: AssetStatus.available,
        city: "Pasig",
        state: "Metro Manila",
        country: "Philippines",
        ...CITY_COORDS["Pasig"],
      },
    ];

    for (const a of assets) {
      await prisma.asset.upsert({
        where: { id: a.id },
        update: { ...a, ownerId: partner.id },
        create: { ...a, ownerId: partner.id },
      });
      console.log(`✓ Seeded partner asset: ${a.name}`);
    }

    // ── Asset Images ──────────────────────────────────────────────────────────
    const assetImages = [
      {
        id: "img-partner-projector",
        url: "https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=800&auto=format&fit=crop",
        name: "projector.jpg",
        assetId: "seed-partner-asset-projector-4k",
      },
      {
        id: "img-partner-led-screen",
        url: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&auto=format&fit=crop",
        name: "led-screen.jpg",
        assetId: "seed-partner-asset-led-screen",
      },
      {
        id: "img-partner-stage-lighting",
        url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop",
        name: "lighting.jpg",
        assetId: "seed-partner-asset-stage-lighting",
      },
      {
        id: "img-partner-streaming-rig",
        url: "https://images.unsplash.com/photo-1505236858219-8359eb29e329?w=800&auto=format&fit=crop",
        name: "streaming.jpg",
        assetId: "seed-partner-asset-streaming-rig",
      },
      {
        id: "img-partner-photo-booth",
        url: "https://images.unsplash.com/photo-1589156280159-27698a70f29e?w=800&auto=format&fit=crop",
        name: "photobooth.jpg",
        assetId: "seed-partner-asset-photo-booth",
      },
      {
        id: "img-partner-pa-system",
        url: "https://images.unsplash.com/photo-1545128485-c400e7702796?w=800&auto=format&fit=crop",
        name: "pa-system.jpg",
        assetId: "seed-partner-asset-pa-system",
      },
      {
        id: "img-partner-wireless-mics",
        url: "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&auto=format&fit=crop",
        name: "mics.jpg",
        assetId: "seed-partner-asset-wireless-mics",
      },
      {
        id: "img-partner-banquet-tables",
        url: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&auto=format&fit=crop",
        name: "tables.jpg",
        assetId: "seed-partner-asset-banquet-tables",
      },
      {
        id: "img-partner-chairs",
        url: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&auto=format&fit=crop",
        name: "chairs.jpg",
        assetId: "seed-partner-asset-chairs-100",
      },
      {
        id: "img-partner-cocktail-tables",
        url: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop",
        name: "cocktail.jpg",
        assetId: "seed-partner-asset-cocktail-tables",
      },
      {
        id: "img-partner-backdrop",
        url: "https://images.unsplash.com/photo-1523438885200-e635ba2c371e?w=800&auto=format&fit=crop",
        name: "backdrop.jpg",
        assetId: "seed-partner-asset-backdrop-stand",
      },
      {
        id: "img-partner-fairy-lights",
        url: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?w=800&auto=format&fit=crop",
        name: "fairylights.jpg",
        assetId: "seed-partner-asset-fairy-lights",
      },
      {
        id: "img-partner-cold-spark",
        url: "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?w=800&auto=format&fit=crop",
        name: "sparks.jpg",
        assetId: "seed-partner-asset-cold-spark",
      },
      {
        id: "img-partner-generator",
        url: "https://images.unsplash.com/photo-1504805572947-34fad45aed93?w=800&auto=format&fit=crop",
        name: "generator.jpg",
        assetId: "seed-partner-asset-generator",
      },
    ];

    for (const img of assetImages) {
      await prisma.file.upsert({
        where: { id: img.id },
        update: { url: img.url },
        create: {
          id: img.id,
          name: img.name,
          type: "image/jpeg",
          url: img.url,
          assetId: img.assetId,
        },
      });
    }
    console.log(`✓ Seeded ${assetImages.length} partner asset images`);

    console.log("✅ Partner seeding completed successfully!");
    return partner;
  } catch (error) {
    console.error("❌ Error seeding partners:", error);
    throw error;
  }
}
