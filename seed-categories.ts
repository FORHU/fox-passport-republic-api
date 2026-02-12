import { prisma } from "./src/utils/prisma";

async function seedCategories() {
  try {
    console.log("Starting category seed...");

    // Quick seed with just key parent categories
    const parentCategories = [
      {
        id: "cc9e5c54-2531-46a2-af02-1150449350d6",
        name: "Celebrations & Milestones",
        slug: "celebrations",
        description: "Moments that say: We're alive, together.",
        image: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop",
        tagline: "Moments that say: \"We're alive, together.\"",
        gradient: "from-lime-300 via-green-400 to-emerald-500",
        spotLabel: "Milestones",
        spotColor: "text-accent",
        icon: "PartyPopper",
      },
      {
        id: "be76c74c-e8a1-4846-a6ae-ad5bf297bec9",
        name: "Private Experiences",
        slug: "private-experiences",
        description: "Invitation-only days for those who know",
        image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&auto=format&fit=crop",
        tagline: "Invitation-only days for those who know",
        gradient: "from-indigo-400 via-purple-500 to-pink-500",
        spotLabel: "Exclusive",
        spotColor: "text-accent",
        icon: "Lock",
      },
      {
        id: "49184dc6-12e9-4be5-a936-890b1e91368d",
        name: "Weddings & Commitments",
        slug: "weddings-commitments",
        description: "Life-defining moments, staged where no one expects them",
        image: "https://images.unsplash.com/photo-1519741497674-611481863552?w=800&auto=format&fit=crop",
        tagline: "Life-defining moments, staged where no one expects them",
        gradient: "from-pink-300 via-rose-400 to-red-400",
        spotLabel: "Once in a Lifetime",
        spotColor: "text-accent",
        icon: "HeartHandshake",
      },
      {
        id: "22181bc7-cc77-4bb4-b733-5f9cb1347520",
        name: "Pop-up & Seasonal Moments",
        slug: "popup-seasonal",
        description: "Here today. Gone tomorrow.",
        image: "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800&auto=format&fit=crop",
        tagline: "Here today. Gone tomorrow.",
        gradient: "from-amber-200 via-yellow-400 to-orange-500",
        spotLabel: "Limited Time",
        spotColor: "text-accent",
        icon: "Sparkles",
      },
      {
        id: "91ebb836-2c95-4375-bb6a-406018116697",
        name: "Signature Places",
        slug: "signature-places",
        description: "Fixed locations where every night feels like an event",
        image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop",
        tagline: "Fixed locations where every night feels like an event",
        gradient: "from-emerald-400 via-teal-500 to-cyan-500",
        spotLabel: "Romantic Destinations",
        spotColor: "text-accent",
        icon: "MapPin",
      },
    ];

    // Insert parent categories
    for (const parent of parentCategories) {
      await prisma.category.upsert({
        where: { id: parent.id },
        update: {
          name: parent.name,
          slug: parent.slug,
          description: parent.description,
          image: parent.image,
          tagline: parent.tagline,
          gradient: parent.gradient,
          spotLabel: parent.spotLabel,
          spotColor: parent.spotColor,
          icon: parent.icon,
        },
        create: {
          id: parent.id,
          name: parent.name,
          slug: parent.slug,
          description: parent.description,
          image: parent.image,
          tagline: parent.tagline,
          gradient: parent.gradient,
          spotLabel: parent.spotLabel,
          spotColor: parent.spotColor,
          icon: parent.icon,
        },
      });
      console.log(`✓ Created/Updated category: ${parent.name}`);
    }

    console.log("\n✅ Category seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding categories:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedCategories();
