import { prisma } from "../src/utils/prisma";

async function main() {
  console.log("=== Running Modular Identity Integrity Checks ===");

  // Verification 1: Confirm passwordHash migration
  const missingPasswordHash: any[] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::text as count FROM "users" WHERE "password" IS NOT NULL AND "passwordHash" IS NULL;`
  );
  console.log("1. Users with password but no passwordHash:", missingPasswordHash[0]?.count);

  // Verification 2: Detect orphaned users
  const missingProfiles: any[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM "users" WHERE id NOT IN (SELECT "userId" FROM "user_profiles");`
  );
  console.log("2a. Users missing user_profiles:", missingProfiles.length);

  const missingSettings: any[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM "users" WHERE id NOT IN (SELECT "userId" FROM "user_settings");`
  );
  console.log("2b. Users missing user_settings:", missingSettings.length);

  const missingActivity: any[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM "users" WHERE id NOT IN (SELECT "userId" FROM "user_activity");`
  );
  console.log("2c. Users missing user_activity:", missingActivity.length);

  // Verification 3: Detect dangling references
  const danglingOAuth: any[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM "oauth_accounts" WHERE "userId" NOT IN (SELECT id FROM "users");`
  );
  console.log("3a. Dangling oauth_accounts:", danglingOAuth.length);

  const danglingPayment: any[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM "payment_accounts" WHERE "userId" NOT IN (SELECT id FROM "users");`
  );
  console.log("3b. Dangling payment_accounts:", danglingPayment.length);

  // Verification 4: Duplicate OAuth identities
  const duplicateOAuth: any[] = await prisma.$queryRawUnsafe(
    `SELECT "provider", "providerAccountId", COUNT(*) 
     FROM "oauth_accounts" 
     GROUP BY "provider", "providerAccountId" 
     HAVING COUNT(*) > 1;`
  );
  console.log("4. Duplicate OAuth identities:", duplicateOAuth.length);

  // Verification 5: Duplicate Stripe accounts
  const duplicateStripe: any[] = await prisma.$queryRawUnsafe(
    `SELECT "stripeAccountId", COUNT(*) 
     FROM "payment_accounts" 
     WHERE "stripeAccountId" IS NOT NULL 
     GROUP BY "stripeAccountId" 
     HAVING COUNT(*) > 1;`
  );
  console.log("5. Duplicate Stripe accounts:", duplicateStripe.length);

  const totalUsers = await prisma.user.count();
  const totalProfiles = await prisma.userProfile.count();
  const totalSettings = await prisma.userSettings.count();
  const totalActivity = await prisma.userActivity.count();
  const totalOAuth = await prisma.oAuthAccount.count();
  const totalPayment = await prisma.paymentAccount.count();

  console.log("\n=== Total Records ===");
  const tables: any[] = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
  );
  console.log("Existing tables in public schema:", tables.map(t => t.table_name));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error executing verification:", e);
  process.exit(1);
});
