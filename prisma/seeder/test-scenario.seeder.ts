import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { faker } from "@faker-js/faker";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding test scenario...");

  // 1. Get or create a test user (Client/Host)
  let testUser = await prisma.user.findFirst({ where: { roleType: { has: "eventFoxer" } } });
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        email: faker.internet.email(),
        username: faker.internet.userName(),
        password: "hashedpassword123",
        roleType: ["eventFoxer"],
        name: "Test Event Foxer",
      },
    });
  }

  // 2. Get or create a venue mayor
  let venueMayor = await prisma.user.findFirst({ where: { roleType: { has: "venueFoxer" } } });
  if (!venueMayor) {
    venueMayor = await prisma.user.create({
      data: {
        email: faker.internet.email(),
        username: faker.internet.userName(),
        password: "hashedpassword123",
        roleType: ["venueFoxer"],
        name: "Test Venue Mayor",
      },
    });
  }

  // 3. Create a test Venue
  const venue = await prisma.venue.create({
    data: {
      mayorId: venueMayor.id,
      category: "indoor",
      name: "The Grand Test Arena",
      description: "A massive arena for testing.",
      capacity: 1000,
      price: 50000,
      billingRate: "daily",
      address: "123 Test St",
      city: "Testville",
      country: "Philippines",
      status: "available",
      spaceType: ["hall"],
      amenities: ["wifi"],
    },
  });
  console.log(`Created Venue: ${venue.name} (ID: ${venue.id})`);

  // 4. Create an Event at the Venue
  const event = await prisma.event.create({
    data: {
      clientId: testUser.id,
      organizerId: testUser.id,
      name: "The Mega Foxer Gathering",
      description: "An event testing massive foxer applications.",
      eventCategory: "corporate",
      startAt: new Date(Date.now() + 86400000 * 30), // 30 days from now
      endAt: new Date(Date.now() + 86400000 * 31),
      guestCount: 500,
      totalAmount: 100000,
      eventStatus: "ongoing",
    },
  });
  console.log(`Created Event: ${event.name} (ID: ${event.id})`);

  // 5. Generate a lot of Gear (Assets) and Talent (Services)
  const providerIds: string[] = [];
  
  // Create some gear and talent foxers
  for (let i = 0; i < 20; i++) {
    const provider = await prisma.user.create({
      data: {
        email: faker.internet.email(),
        username: faker.internet.userName(),
        password: "hashedpassword123",
        roleType: i % 2 === 0 ? ["gearFoxer"] : ["serviceFoxer"],
        name: faker.person.fullName(),
      },
    });
    providerIds.push(provider.id);
  }

  console.log(`Created ${providerIds.length} Providers.`);

  // 6. Assign them as In-House to the Venue OR Applying/Booked in the Event
  for (let i = 0; i < providerIds.length; i++) {
    const providerId = providerIds[i];
    const isGear = i % 2 === 0;

    if (isGear) {
      // Create Asset
      const asset = await prisma.asset.create({
        data: {
          ownerId: providerId,
          category: "sound_system",
          name: `${faker.commerce.productAdjective()} Sound System`,
          description: faker.commerce.productDescription(),
          price: faker.number.int({ min: 1000, max: 10000 }),
          billingRate: "daily",
          status: "available",
        },
      });

      // Add to event as booked transaction
      if (i % 4 !== 0) {
        await prisma.eventAssetTransaction.create({
          data: {
            eventId: event.id,
            assetId: asset.id,
            providerId: providerId,
            status: i % 3 === 0 ? "pending" : "approved",
            agreedPrice: asset.price,
            quantity: 1,
          },
        });
      }
    } else {
      // Create Service
      const service = await prisma.service.create({
        data: {
          ownerId: providerId,
          category: "entertainment",
          name: `${faker.person.firstName()} the DJ`,
          description: faker.person.bio(),
          price: faker.number.int({ min: 5000, max: 20000 }),
          billingRate: "hourly",
          status: "available",
        },
      });

      // Add to event as booked transaction
      if (i % 4 !== 1) {
        await prisma.eventServiceTransaction.create({
          data: {
            eventId: event.id,
            serviceId: service.id,
            providerId: providerId,
            status: i % 3 === 0 ? "pending" : "approved",
            agreedPrice: service.price,
          },
        });

      }
    }
  }

  console.log("✅ Seed complete! You now have:");
  console.log("- A venue with in-house gear & talent.");
  console.log("- An event with many pending/approved gear & talent transactions and bids.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
