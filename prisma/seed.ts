import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedUsers, seedVenues, seedAssets, seedServices, seedEvents } from "./seeder";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting database seed...");

  // 1. Seed Users (and get them for references)
  const users = await seedUsers(prisma);

  // 2. Seed Venues
  await seedVenues(prisma, users);

  // 3. Seed Assets
  await seedAssets(prisma, users);

  // 4. Seed Services
  await seedServices(prisma, users);

  // 5. Seed Events (templates + approved events)
  await seedEvents(prisma, users);

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
