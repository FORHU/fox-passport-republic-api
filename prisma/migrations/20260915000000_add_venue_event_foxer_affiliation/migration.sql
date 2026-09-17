-- CreateEnum
CREATE TYPE "AffiliationInitiator" AS ENUM ('eventFoxer', 'venueFoxer');

-- CreateEnum
CREATE TYPE "AffiliationStatus" AS ENUM ('pending', 'approved', 'rejected', 'revoked');

-- CreateTable
CREATE TABLE "venue_event_foxer_affiliations" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "eventFoxerId" TEXT NOT NULL,
    "initiatedBy" "AffiliationInitiator" NOT NULL,
    "status" "AffiliationStatus" NOT NULL DEFAULT 'pending',
    "permissions" TEXT[] DEFAULT ARRAY['template:attach', 'calendar:block']::TEXT[],
    "agreedPrice" DECIMAL(12,2),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_event_foxer_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "venue_event_foxer_affiliations_venueId_eventFoxerId_key" ON "venue_event_foxer_affiliations"("venueId", "eventFoxerId");

-- CreateIndex
CREATE INDEX "venue_event_foxer_affiliations_eventFoxerId_status_idx" ON "venue_event_foxer_affiliations"("eventFoxerId", "status");

-- CreateIndex
CREATE INDEX "venue_event_foxer_affiliations_venueId_status_idx" ON "venue_event_foxer_affiliations"("venueId", "status");

-- AddForeignKey
ALTER TABLE "venue_event_foxer_affiliations" ADD CONSTRAINT "venue_event_foxer_affiliations_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_event_foxer_affiliations" ADD CONSTRAINT "venue_event_foxer_affiliations_eventFoxerId_fkey" FOREIGN KEY ("eventFoxerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venue_event_foxer_affiliations" ADD CONSTRAINT "venue_event_foxer_affiliations_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
