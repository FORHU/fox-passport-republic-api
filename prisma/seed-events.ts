import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

// Sample event images by category type
const IMAGES = {
  adventures: [
    "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1501555088652-021faa106b9b?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1568572933382-74d440642117?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1544552866-d3ed42536cfd?auto=format&fit=crop&w=800&q=80",
  ],
  camping: [
    "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1542718610-a1d656d1884c?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1476362555312-ab9e108a0b7e?auto=format&fit=crop&w=800&q=80",
  ],
  food: [
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=800&q=80",
  ],
  music: [
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80",
  ],
  nightlife: [
    "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1545128485-c400e7702796?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1571204829887-3b8d69e4094d?auto=format&fit=crop&w=800&q=80",
  ],
  venues: [
    "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=800&q=80",
  ],
  wellness: [
    "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1600334089648-b0d9d3028eb2?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1507652313519-d4e9174996dd?auto=format&fit=crop&w=800&q=80",
  ],
};

// Sample events by category slug
const EVENTS_DATA: Record<
  string,
  Array<{
    title: string;
    description: string;
    city: string;
    state: string;
    address: string;
    price: number;
  }>
> = {
  adventures: [
    {
      title: "Mt. Pulag Sunrise Trek",
      description:
        "Experience the breathtaking sea of clouds at Mt. Pulag, the third highest mountain in the Philippines. This guided trek includes camping and an unforgettable sunrise experience.",
      city: "Kabayan",
      state: "Benguet",
      address: "Mt. Pulag National Park",
      price: 3500,
    },
    {
      title: "Coron Island Hopping Adventure",
      description:
        "Explore the crystal-clear waters and stunning lagoons of Coron. Visit Kayangan Lake, Twin Lagoon, and swim with incredible marine life.",
      city: "Coron",
      state: "Palawan",
      address: "Coron Bay",
      price: 2800,
    },
  ],
  camping: [
    {
      title: "Glamping at Treasure Mountain",
      description:
        "Luxury camping experience with stunning mountain views. Includes fully furnished tents, BBQ dinner, and breakfast with a view.",
      city: "Tanay",
      state: "Rizal",
      address: "Treasure Mountain Resort",
      price: 4500,
    },
    {
      title: "Beach Camping in Zambales",
      description:
        "Experience beachfront camping with bonfire, stargazing, and water activities. Perfect for groups and solo adventurers alike.",
      city: "San Felipe",
      state: "Zambales",
      address: "Crystal Beach Resort",
      price: 1800,
    },
  ],
  "food-dining": [
    {
      title: "Filipino Cooking Class",
      description:
        "Learn to cook authentic Filipino dishes with a local chef. Make adobo, sinigang, and halo-halo from scratch in this hands-on experience.",
      city: "Makati",
      state: "Metro Manila",
      address: "Legazpi Village",
      price: 2200,
    },
    {
      title: "Poblacion Food Crawl",
      description:
        "Discover the best hidden gems and must-try restaurants in Poblacion. Taste local and international cuisines with a passionate food guide.",
      city: "Makati",
      state: "Metro Manila",
      address: "Poblacion, Makati",
      price: 1500,
    },
  ],
  "music-arts": [
    {
      title: "Indie Music Night at Saguijo",
      description:
        "An evening of live indie music featuring local up-and-coming bands. Experience the vibrant local music scene in an intimate setting.",
      city: "Makati",
      state: "Metro Manila",
      address: "Saguijo Cafe + Bar",
      price: 500,
    },
    {
      title: "Art Workshop at Pinto Art Museum",
      description:
        "Create your own masterpiece surrounded by incredible art. Includes museum tour, art materials, and refreshments.",
      city: "Antipolo",
      state: "Rizal",
      address: "Pinto Art Museum",
      price: 1800,
    },
  ],
  nightlife: [
    {
      title: "BGC Rooftop Bar Hopping",
      description:
        "Experience the best rooftop bars in Bonifacio Global City. Enjoy craft cocktails, stunning city views, and great company.",
      city: "Taguig",
      state: "Metro Manila",
      address: "BGC High Street",
      price: 1200,
    },
    {
      title: "Poblacion Nightlife Tour",
      description:
        "Explore the hottest bars and clubs in Poblacion. From hidden speakeasies to pumping dance floors, experience Manila's nightlife capital.",
      city: "Makati",
      state: "Metro Manila",
      address: "Poblacion, Makati",
      price: 800,
    },
  ],
  venues: [
    {
      title: "Rustic Garden Wedding Venue",
      description:
        "Beautiful garden venue perfect for intimate weddings and events. Accommodates up to 150 guests with full event coordination support.",
      city: "Tagaytay",
      state: "Cavite",
      address: "Alfonso, Tagaytay",
      price: 85000,
    },
    {
      title: "Lakeside Events Hall",
      description:
        "Stunning lakeside venue with modern amenities. Ideal for corporate events, parties, and celebrations with up to 300 guests.",
      city: "Calamba",
      state: "Laguna",
      address: "Pansol",
      price: 65000,
    },
  ],
  wellness: [
    {
      title: "Yoga Retreat in Baler",
      description:
        "A weekend of yoga, meditation, and surfing in beautiful Baler. Includes accommodation, healthy meals, and daily yoga sessions.",
      city: "Baler",
      state: "Aurora",
      address: "Sabang Beach",
      price: 8500,
    },
    {
      title: "Spa Day at Nurture Wellness Village",
      description:
        "Full day spa experience including massage, body scrub, facial, and access to organic pools. Complete relaxation awaits.",
      city: "Tagaytay",
      state: "Cavite",
      address: "Nurture Wellness Village",
      price: 5500,
    },
  ],
};

async function main() {
  console.log("🌱 Starting events seed...");

  // Create or get host user
  let host = await prisma.user.findFirst({
    where: { email: "seedhost@foxpassport.com" },
  });

  if (!host) {
    const hashedPassword = await bcrypt.hash("password123", 10);
    host = await prisma.user.create({
      data: {
        email: "seedhost@foxpassport.com",
        password: hashedPassword,
        name: "Fox Passport Host",
        username: "foxpassporthost",
        isHost: true,
        isVerified: true,
      },
    });
    console.log("✅ Created seed host user");
  } else {
    console.log("✅ Using existing seed host user");
  }

  // Get all categories
  const categories = await prisma.category.findMany();
  console.log(`📦 Found ${categories.length} categories`);

  if (categories.length === 0) {
    console.log("❌ No categories found. Please create categories first.");
    return;
  }

  let eventsCreated = 0;

  for (const category of categories) {
    // Map category slug to events data
    const eventsForCategory = EVENTS_DATA[category.slug];
    const images =
      IMAGES[category.slug as keyof typeof IMAGES] || IMAGES.adventures;

    if (!eventsForCategory) {
      console.log(
        `⏭️  No sample events for category: ${category.name} (${category.slug})`
      );
      continue;
    }

    for (let i = 0; i < eventsForCategory.length; i++) {
      const eventData = eventsForCategory[i];

      // Check if event already exists
      const existingEvent = await prisma.event.findFirst({
        where: { title: eventData.title },
      });

      if (existingEvent) {
        console.log(`⏭️  Event already exists: ${eventData.title}`);
        continue;
      }

      // Create the event
      const event = await prisma.event.create({
        data: {
          hostId: host.id,
          categoryId: category.id,
          title: eventData.title,
          description: eventData.description,
          status: "active",
          isPublished: true,
          maxAttendees: 20,
          details: {
            create: {
              locationAddress: eventData.address,
              city: eventData.city,
              state: eventData.state,
              country: "Philippines",
              startDatetime: new Date("2025-03-01T09:00:00Z"),
              endDatetime: new Date("2025-03-01T17:00:00Z"),
            },
          },
          pricing: {
            create: {
              basePrice: eventData.price,
              currency: "PHP",
              serviceFeePercent: 5,
              taxPercent: 12,
            },
          },
          images: {
            create: [
              {
                imageUrl: images[i * 2] || images[0],
                isPrimary: true,
                displayOrder: 1,
              },
              {
                imageUrl: images[i * 2 + 1] || images[1],
                isPrimary: false,
                displayOrder: 2,
              },
            ],
          },
        },
      });

      console.log(`✅ Created event: ${event.title}`);
      eventsCreated++;
    }
  }

  console.log(
    `\n🎉 Events seeding completed! Created ${eventsCreated} events.`
  );
}

main()
  .catch((error) => {
    console.error("❌ Error during seeding:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
