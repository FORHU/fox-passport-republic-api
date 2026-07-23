import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedUsers, seedVenues, seedAssets, seedServices, seedEvents, seedBookings, seedReviews, seedItemBookings, seedBadges, seedPassports, seedSpecializations, seedCancellationPolicies, seedPartners } from "./seeder";

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

  // 6. Seed Bookings (pre-existing confirmed bookings for approved events)
  await seedBookings(prisma, users);

  // 7. Seed Reviews (venue + event reviews for activity feed and rating bars)
  await seedReviews(prisma, users);

  // 8. Seed Item Bookings (service + asset bookings for foxer flow testing)
  await seedItemBookings(prisma, users);

  // 9. Seed Cancellation Policies
  await seedCancellationPolicies(prisma);

  // 10. Seed Badges (platform-wide badge definitions)
  await seedBadges(prisma);

  // 10. Seed Passports (XP paths, stamps, and badge grants per user)
  await seedPassports(prisma, users);

  // 11. Seed Specializations (declared + earned tags per foxer)
  await seedSpecializations(prisma, users);

  // 12. Seed Partners (multi-role partner user with owned venues, assets, and gear)
  await seedPartners(prisma);

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
