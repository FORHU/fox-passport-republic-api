-- Location changes after a booking is confirmed, and guests' acknowledgements
-- (epic #517, #521). Two new tables only. Down: DROP TABLE
-- "event_location_acknowledgements"; DROP TABLE "event_location_changes";

-- CreateTable
CREATE TABLE "event_location_changes" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "fromPlaceId" TEXT,
    "toPlaceId" TEXT NOT NULL,
    "fromSnapshot" JSONB NOT NULL,
    "toSnapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "material" BOOLEAN NOT NULL,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_location_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_location_acknowledgements" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_location_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_location_changes_eventId_createdAt_idx" ON "event_location_changes"("eventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_location_acknowledgements_changeId_bookingId_key" ON "event_location_acknowledgements"("changeId", "bookingId");

-- AddForeignKey
ALTER TABLE "event_location_changes" ADD CONSTRAINT "event_location_changes_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_location_changes" ADD CONSTRAINT "event_location_changes_fromPlaceId_fkey" FOREIGN KEY ("fromPlaceId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_location_changes" ADD CONSTRAINT "event_location_changes_toPlaceId_fkey" FOREIGN KEY ("toPlaceId") REFERENCES "places"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_location_acknowledgements" ADD CONSTRAINT "event_location_acknowledgements_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "event_location_changes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_location_acknowledgements" ADD CONSTRAINT "event_location_acknowledgements_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

