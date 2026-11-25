-- Booked-event date changes (ADR 0010 decision 6). A proposal is now either a
-- swap of one Supplier (the existing rows) or a reschedule of the whole event.

-- CreateEnum
CREATE TYPE "EventEditProposalType" AS ENUM ('swap', 'reschedule');

-- AlterTable: every existing row is a swap, so the default backfills them.
ALTER TABLE "event_edit_proposals"
  ADD COLUMN "type" "EventEditProposalType" NOT NULL DEFAULT 'swap',
  ADD COLUMN "proposedStartAt" TIMESTAMP(3),
  ADD COLUMN "proposedEndAt" TIMESTAMP(3),
  ADD COLUMN "previousStartAt" TIMESTAMP(3),
  ADD COLUMN "previousEndAt" TIMESTAMP(3),
  ALTER COLUMN "kind" DROP NOT NULL,
  ALTER COLUMN "replacesTransactionId" DROP NOT NULL,
  ALTER COLUMN "itemId" DROP NOT NULL;

-- A swap names the line and the listing; a reschedule names the dates.
ALTER TABLE "event_edit_proposals" ADD CONSTRAINT "event_edit_proposals_shape" CHECK (
  ("type" = 'swap'
    AND "kind" IS NOT NULL
    AND "replacesTransactionId" IS NOT NULL
    AND "itemId" IS NOT NULL
    AND "proposedStartAt" IS NULL)
  OR ("type" = 'reschedule'
    AND "proposedStartAt" IS NOT NULL
    AND "proposedEndAt" IS NOT NULL
    AND "proposedEndAt" > "proposedStartAt"
    AND "previousStartAt" IS NOT NULL
    AND "previousEndAt" IS NOT NULL)
);

-- One open date change per booking. (The per-line index above only covers
-- swaps: a reschedule's replacesTransactionId is NULL, and NULLs are distinct.)
CREATE UNIQUE INDEX "event_edit_proposals_one_pending_reschedule"
  ON "event_edit_proposals"("bookingId")
  WHERE "status" = 'pending' AND "type" = 'reschedule';
