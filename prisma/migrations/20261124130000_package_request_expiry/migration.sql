-- Package requests expire after 3 days with a reminder after 2 (api#462).
-- One enum value and two columns per line table; existing rows get
-- requestedAt = now, so open requests have 3 days from this release.

-- AlterEnum
ALTER TYPE "MatchRequestStatus" ADD VALUE 'expired';

-- AlterTable
ALTER TABLE "event_template_assets" ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "remindedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_template_services" ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "remindedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_template_venues" ADD COLUMN "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "remindedAt" TIMESTAMP(3);
