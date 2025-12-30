import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");

  // Seed Interests
  const interests = await prisma.interest.createMany({
    data: [
      {
        name: "KPOP",
        description: "Korean Pop music and culture",
        icon: "🎵",
      },
      {
        name: "Dance",
        description: "Choreography and dance performances",
        icon: "💃",
      },
      {
        name: "Music",
        description: "General music appreciation",
        icon: "🎶",
      },
      {
        name: "Fashion",
        description: "Style, outfits, and fashion trends",
        icon: "👗",
      },
      {
        name: "Beauty",
        description: "Makeup, skincare, and beauty tutorials",
        icon: "💄",
      },
    ],
    skipDuplicates: true,
  });

  console.log(`✅ Seeded ${interests.count} interests`);

  // Seed Emotions
  const emotions = await prisma.emotion.createMany({
    data: [
      {
        name: "Happy",
        description: "Feeling joyful and upbeat",
        icon: "😊",
      },
      {
        name: "Sad",
        description: "Feeling down or melancholic",
        icon: "😢",
      },
      {
        name: "Excited",
        description: "Feeling energized and enthusiastic",
        icon: "🤩",
      },
      {
        name: "Calm",
        description: "Feeling peaceful and relaxed",
        icon: "😌",
      },
      {
        name: "Tired",
        description: "Feeling exhausted or low energy",
        icon: "😴",
      },
      {
        name: "Anxious",
        description: "Feeling worried or stressed",
        icon: "😰",
      },
      {
        name: "Bored",
        description: "Feeling uninterested or restless",
        icon: "😑",
      },
    ],
    skipDuplicates: true,
  });

  console.log(`✅ Seeded ${emotions.count} emotions`);

  // Seed Artists
  const artists = await prisma.artist.createMany({
    data: [
      {
        name: "BTS",
        bio: '7-member boy group from Big Hit Music, global superstars known for "Dynamite", "Butter", and "Spring Day"',
        nationality: "South Korea",
        genre: "KPOP",
      },
      {
        name: "BLACKPINK",
        bio: '4-member girl group from YG Entertainment, known for "DDU-DU DDU-DU", "Kill This Love", and "How You Like That"',
        nationality: "South Korea",
        genre: "KPOP",
      },
      {
        name: "TWICE",
        bio: '9-member girl group from JYP Entertainment, known for catchy hits like "Cheer Up", "TT", and "Fancy"',
        nationality: "South Korea",
        genre: "KPOP",
      },
      {
        name: "SEVENTEEN",
        bio: '13-member boy group from Pledis Entertainment, self-producing group known for "Don\'t Wanna Cry", "Left & Right", and "Super"',
        nationality: "South Korea",
        genre: "KPOP",
      },
      {
        name: "NewJeans",
        bio: '5-member girl group from ADOR (HYBE), rookie sensation known for "Attention", "Hype Boy", and "OMG"',
        nationality: "South Korea",
        genre: "KPOP",
      },
    ],
    skipDuplicates: true, // Skip if artist already exists
  });

  console.log(`✅ Seeded ${artists.count} artists`);

  console.log("🎉 Database seeding completed!");
}

main()
  .catch((error) => {
    console.error(" Error during seeding:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
