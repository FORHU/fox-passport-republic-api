-- Event payment breakdown, schema half (#264).
--
-- An Event is priced per Foxer line: the Foxer's price (agreedPrice), plus the
-- EventFoxer's commission, a FoxPassport fee per category and a 3% processing
-- fee. This migration only adds the columns that hold those rates and amounts;
-- the code that fills them comes after it.
--
-- Additive only: every column is nullable or has a constant default, so on
-- PostgreSQL 11+ none of these ALTERs rewrites its table, and code from before
-- this migration keeps working against it. Existing rows are left alone: a
-- null line snapshot / Event.commissionPct means "priced the old way".
--
-- Generated with `prisma migrate diff --from-schema <staging schema>
-- --to-schema prisma/schema --script` and read before committing.
--
-- users.commissionPct starts at 0; tools/backfill-eventfoxer-commission.ts
-- sets each EventFoxer's starting rate from their templates' hostMarkupPct.

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "processingFee" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "commissionPct" DECIMAL(5,2),
ADD COLUMN     "processingFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "event_asset_transactions" ADD COLUMN     "category" TEXT,
ADD COLUMN     "commissionAmount" DECIMAL(12,2),
ADD COLUMN     "commissionPct" DECIMAL(5,2),
ADD COLUMN     "platformFeeAmount" DECIMAL(12,2),
ADD COLUMN     "platformFeePct" DECIMAL(5,2),
ADD COLUMN     "processingFeeAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "event_service_transactions" ADD COLUMN     "category" TEXT,
ADD COLUMN     "commissionAmount" DECIMAL(12,2),
ADD COLUMN     "commissionPct" DECIMAL(5,2),
ADD COLUMN     "platformFeeAmount" DECIMAL(12,2),
ADD COLUMN     "platformFeePct" DECIMAL(5,2),
ADD COLUMN     "processingFeeAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "event_venue_transactions" ADD COLUMN     "category" TEXT,
ADD COLUMN     "commissionAmount" DECIMAL(12,2),
ADD COLUMN     "commissionPct" DECIMAL(5,2),
ADD COLUMN     "platformFeeAmount" DECIMAL(12,2),
ADD COLUMN     "platformFeePct" DECIMAL(5,2),
ADD COLUMN     "processingFeeAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commissionPct" DECIMAL(5,2) NOT NULL DEFAULT 0;
