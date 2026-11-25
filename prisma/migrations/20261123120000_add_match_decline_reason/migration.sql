-- Providers decline package invites with a reason (api#447). New nullable
-- columns only; existing rows are unchanged.

-- CreateEnum
CREATE TYPE "MatchDeclineReason" AS ENUM ('unavailable_on_date', 'price_too_low', 'not_my_kind_of_event', 'too_far', 'no_capacity', 'other');

-- AlterTable
ALTER TABLE "event_template_assets" ADD COLUMN "declineReason" "MatchDeclineReason",
ADD COLUMN "declineNote" TEXT,
ADD COLUMN "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_template_services" ADD COLUMN "declineReason" "MatchDeclineReason",
ADD COLUMN "declineNote" TEXT,
ADD COLUMN "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_template_venues" ADD COLUMN "declineReason" "MatchDeclineReason",
ADD COLUMN "declineNote" TEXT,
ADD COLUMN "respondedAt" TIMESTAMP(3);
