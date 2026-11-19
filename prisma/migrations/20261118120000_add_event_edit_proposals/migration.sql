-- CreateEnum
CREATE TYPE "EventEditProposalStatus" AS ENUM ('pending', 'accepted', 'declined', 'withdrawn', 'expired');

-- CreateTable
CREATE TABLE "event_edit_proposals" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "replacesTransactionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "currentPrice" DECIMAL(12,2) NOT NULL,
    "proposedPrice" DECIMAL(12,2) NOT NULL,
    "priceDelta" DECIMAL(12,2) NOT NULL,
    "status" "EventEditProposalStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "appliedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_edit_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_edit_proposals_bookingId_status_idx" ON "event_edit_proposals"("bookingId", "status");

-- CreateIndex
CREATE INDEX "event_edit_proposals_eventId_idx" ON "event_edit_proposals"("eventId");

-- AddForeignKey
ALTER TABLE "event_edit_proposals" ADD CONSTRAINT "event_edit_proposals_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_edit_proposals" ADD CONSTRAINT "event_edit_proposals_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_edit_proposals" ADD CONSTRAINT "event_edit_proposals_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One open proposal per replaced line: two at once would race to replace it.
CREATE UNIQUE INDEX "event_edit_proposals_one_pending_per_line"
  ON "event_edit_proposals"("replacesTransactionId")
  WHERE "status" = 'pending';
