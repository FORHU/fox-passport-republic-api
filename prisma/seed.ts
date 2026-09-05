import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertSchemaIsMigrated } from "./preflight";
import {
  seedUsers,
  seedVenues,
  seedAssets,
  seedServices,
  seedEvents,
  seedBookings,
  seedReviews,
  seedItemBookings,
  seedBadges,
  seedPassports,
  seedSpecializations,
  seedCancellationPolicies,
  seedPartners,
} from "./seeder";

/**
 * Hosts the seed is willing to write to.
 *
 * `NODE_ENV` alone is not enough of a guard. The realistic accident is not
 * "someone set NODE_ENV=production and seeded anyway" — it is a developer with
 * NODE_ENV unset whose DATABASE_URL points at staging. So the destination is
 * checked as well as the environment.
 *
 * `postgres` and `local_postgres` cover docker-compose, where the database is
 * reached by service/container name rather than by localhost.
 */
const LOCAL_DB_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "local_postgres",
]);

/**
 * This seed creates real, working accounts — including `admin@example.com` with
 * `systemRole: "admin"` — from passwords committed to this repository. Running
 * it against anything shared hands out a public administrator login.
 *
 * Set `ALLOW_SEED=1` to override, deliberately and per-invocation.
 */
function assertSafeToSeed(): void {
  if (process.env.ALLOW_SEED === "1") {
    console.warn(
      "⚠️  ALLOW_SEED=1 — running the seed against a non-local database on purpose.",
    );
    return;
  }

  const refuse = (why: string): never => {
    console.error(
      `\n❌ Refusing to seed: ${why}\n\n` +
        "   This seed creates admin@example.com with a password committed to the\n" +
        "   repository. Seeding a shared database would publish an admin login.\n\n" +
        "   If you really mean it: ALLOW_SEED=1 pnpm prisma db seed\n",
    );
    process.exit(1);
  };

  const url = process.env.DATABASE_URL;
  if (!url) refuse("DATABASE_URL is not set");

  const env = process.env.NODE_ENV ?? "development";
  if (env !== "development" && env !== "test") {
    refuse(`NODE_ENV is "${env}", not development or test`);
  }

  let hostname: string;
  try {
    hostname = new URL(url as string).hostname;
  } catch {
    refuse("DATABASE_URL could not be parsed");
  }

  if (!LOCAL_DB_HOSTS.has(hostname!)) {
    refuse(
      `DATABASE_URL points at "${hostname!}", which is not a local database`,
    );
  }
}

assertSafeToSeed();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Before anything is written. `assertSafeToSeed` above checks we are allowed
  // to write here; this checks the database can actually hold what we are about
  // to write. Both refuse rather than half-succeed.
  await assertSchemaIsMigrated(pool);

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
