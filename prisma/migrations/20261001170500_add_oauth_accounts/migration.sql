-- Stage 1: Expand (Create Enums, Tables, Foreign Keys, Indexes)

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'FACEBOOK', 'APPLE');

-- AlterTable users to add nullable passwordHash and make password nullable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable user_profiles
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "imgId" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'Philippines',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable user_settings
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredCurrency" TEXT NOT NULL DEFAULT 'PHP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable payment_accounts
CREATE TABLE "payment_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeAccountId" TEXT,
    "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable user_activity
CREATE TABLE "user_activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastActiveAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable oauth_accounts
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- Unique Indexes
CREATE UNIQUE INDEX "user_profiles_userId_key" ON "user_profiles"("userId");
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");
CREATE UNIQUE INDEX "payment_accounts_userId_key" ON "payment_accounts"("userId");
CREATE UNIQUE INDEX "payment_accounts_stripeCustomerId_key" ON "payment_accounts"("stripeCustomerId");
CREATE UNIQUE INDEX "payment_accounts_stripeAccountId_key" ON "payment_accounts"("stripeAccountId");
CREATE UNIQUE INDEX "user_activity_userId_key" ON "user_activity"("userId");
CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key" ON "oauth_accounts"("provider", "providerAccountId");
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

-- Foreign Keys
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stage 2: Migrate (Safe Data Backfill)

-- 1. Profiles Backfill
INSERT INTO "user_profiles" ("id", "userId", "phone", "imgId", "address", "city", "state", "country", "isPrivate", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    "phone",
    "imgId",
    "address",
    "city",
    "state",
    COALESCE("country", 'Philippines'),
    COALESCE("isPrivate", false),
    "createdAt",
    "updatedAt"
FROM "users"
ON CONFLICT ("userId") DO NOTHING;

-- 2. Settings Backfill
INSERT INTO "user_settings" ("id", "userId", "preferredCurrency", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    COALESCE("preferredCurrency", 'PHP'),
    "createdAt",
    "updatedAt"
FROM "users"
ON CONFLICT ("userId") DO NOTHING;

-- 3. Payments Backfill (Lazy: only for users with existing Stripe data)
INSERT INTO "payment_accounts" ("id", "userId", "stripeCustomerId", "stripeChargesEnabled", "stripePayoutsEnabled", "stripeAccountId", "stripeOnboardingComplete", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    "stripeCustomerId",
    COALESCE("stripeChargesEnabled", false),
    COALESCE("stripePayoutsEnabled", false),
    "stripeAccountId",
    COALESCE("stripeOnboardingComplete", false),
    "createdAt",
    "updatedAt"
FROM "users"
WHERE "stripeCustomerId" IS NOT NULL OR "stripeAccountId" IS NOT NULL
ON CONFLICT ("userId") DO NOTHING;

-- 4. Activity Backfill
INSERT INTO "user_activity" ("id", "userId", "lastActiveAt", "lastSeenAt", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    "lastActiveAt",
    NULL,
    "createdAt",
    "updatedAt"
FROM "users"
ON CONFLICT ("userId") DO NOTHING;

-- 5. Google OAuth Backfill
INSERT INTO "oauth_accounts" ("id", "userId", "provider", "providerAccountId", "email", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    'GOOGLE'::"OAuthProvider",
    "googleId",
    "email",
    "createdAt",
    "updatedAt"
FROM "users"
WHERE "googleId" IS NOT NULL
ON CONFLICT ("provider", "providerAccountId") DO NOTHING;

-- 6. Password Hash Backfill
UPDATE "users"
SET "passwordHash" = "password"
WHERE "passwordHash" IS NULL
  AND "password" IS NOT NULL
  AND "password" LIKE '$2%';
