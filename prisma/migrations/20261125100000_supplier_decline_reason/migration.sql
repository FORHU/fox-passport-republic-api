-- api#476: why a venue or Provider turned down or left a booking, and their
-- note, shown to the Event Foxer. Additive only: a new enum type and nullable
-- columns with no default, so existing rows need no backfill and the ALTERs
-- don't rewrite the tables.

-- CreateEnum
CREATE TYPE "SupplierDeclineReason" AS ENUM ('already_booked', 'closed', 'not_suitable', 'other');

-- AlterTable
ALTER TABLE "event_asset_transactions" ADD COLUMN "declineNote" VARCHAR(300),
ADD COLUMN "declineReason" "SupplierDeclineReason";

-- AlterTable
ALTER TABLE "event_service_transactions" ADD COLUMN "declineNote" VARCHAR(300),
ADD COLUMN "declineReason" "SupplierDeclineReason";

-- AlterTable
ALTER TABLE "event_venue_transactions" ADD COLUMN "declineNote" VARCHAR(300),
ADD COLUMN "declineReason" "SupplierDeclineReason";
