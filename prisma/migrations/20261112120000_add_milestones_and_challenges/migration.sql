-- CreateEnum
CREATE TYPE "MilestoneCounter" AS ENUM ('booked_events', 'attended_events', 'cities', 'venues', 'reviews', 'spend');

-- CreateEnum
CREATE TYPE "MilestoneCountMode" AS ENUM ('paid', 'attended');

-- CreateEnum
CREATE TYPE "ChallengeWindow" AS ENUM ('day', 'week', 'month');

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "counter" "MilestoneCounter" NOT NULL,
    "counts" "MilestoneCountMode" NOT NULL DEFAULT 'attended',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_tiers" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "target" INTEGER NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "badgeName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "period" "ChallengeWindow" NOT NULL,
    "target" INTEGER NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "milestones_key_key" ON "milestones"("key");

-- CreateIndex
CREATE UNIQUE INDEX "milestone_tiers_milestoneId_tier_key" ON "milestone_tiers"("milestoneId", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "challenges_key_key" ON "challenges"("key");

-- AddForeignKey
ALTER TABLE "milestone_tiers" ADD CONSTRAINT "milestone_tiers_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed the defaults from the rewards revision (RR-6). Every amount is admin-editable
-- afterwards; rule changes apply to new earnings only.
INSERT INTO "milestones" ("id", "key", "name", "description", "counter", "counts", "active", "sortOrder", "updatedAt") VALUES
('ms-booked-events', 'booked_events', 'Booked events', 'Paid bookings, payment confirmed', 'booked_events', 'paid', true, 1, CURRENT_TIMESTAMP),
('ms-attended-events', 'attended_events', 'Attended events', 'Bookings you checked in to', 'attended_events', 'attended', true, 2, CURRENT_TIMESTAMP),
('ms-cities', 'cities', 'Cities visited', 'Distinct cities with a stamp', 'cities', 'attended', true, 3, CURRENT_TIMESTAMP),
('ms-venues', 'venues', 'Venues visited', 'Distinct venues with a stamp', 'venues', 'attended', true, 4, CURRENT_TIMESTAMP),
('ms-reviews', 'reviews', 'Reviews written', 'Reviews on attended bookings', 'reviews', 'attended', true, 5, CURRENT_TIMESTAMP),
('ms-big-spender', 'big_spender', 'Big Spender', 'Money actually paid on attended bookings, minus refunds', 'spend', 'attended', true, 6, CURRENT_TIMESTAMP);

-- Cumulative tiers 1, 5, 10, 25, 50 with 10, 25, 50, 100 and 200 Tokens.
INSERT INTO "milestone_tiers" ("id", "milestoneId", "tier", "target", "tokens", "updatedAt")
SELECT 'mst-' || m."key" || '-' || t."tier", m."id", t."tier", t."target", t."tokens", CURRENT_TIMESTAMP
FROM "milestones" m
CROSS JOIN (VALUES (1, 1, 10), (2, 5, 25), (3, 10, 50), (4, 25, 100), (5, 50, 200)) AS t("tier", "target", "tokens")
WHERE m."key" IN ('booked_events', 'attended_events', 'cities', 'venues', 'reviews');

-- Big Spender: pesos paid on attended bookings. The Token amounts are set by an admin.
INSERT INTO "milestone_tiers" ("id", "milestoneId", "tier", "target", "tokens", "updatedAt") VALUES
('mst-big_spender-1', 'ms-big-spender', 1, 20000, 0, CURRENT_TIMESTAMP),
('mst-big_spender-2', 'ms-big-spender', 2, 50000, 0, CURRENT_TIMESTAMP),
('mst-big_spender-3', 'ms-big-spender', 3, 100000, 0, CURRENT_TIMESTAMP),
('mst-big_spender-4', 'ms-big-spender', 4, 250000, 0, CURRENT_TIMESTAMP),
('mst-big_spender-5', 'ms-big-spender', 5, 500000, 0, CURRENT_TIMESTAMP),
('mst-big_spender-6', 'ms-big-spender', 6, 1000000, 0, CURRENT_TIMESTAMP);

-- Booking challenges: windows in Manila time. Token amounts are set by an admin.
INSERT INTO "challenges" ("id", "key", "name", "description", "period", "target", "tokens", "active", "sortOrder", "updatedAt") VALUES
('ch-book-today', 'book_today', 'Book today', 'Make 1 booking today', 'day', 1, 0, true, 1, CURRENT_TIMESTAMP),
('ch-weekly-regular', 'weekly_regular', 'Weekly regular', 'Make 3 bookings this week', 'week', 3, 0, true, 2, CURRENT_TIMESTAMP),
('ch-monthly-explorer', 'monthly_explorer', 'Monthly explorer', 'Make 5 bookings this month', 'month', 5, 0, true, 3, CURRENT_TIMESTAMP),
('ch-monthly-champion', 'monthly_champion', 'Monthly champion', 'Make 10 bookings this month', 'month', 10, 0, true, 4, CURRENT_TIMESTAMP);
