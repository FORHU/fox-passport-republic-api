-- Organizer requests (docs/adr/0005): each Venue and Event says whether it
-- accepts them — off by default, so nobody gets requests they didn't ask for.
ALTER TABLE "venues" ADD COLUMN "acceptsOrganizerRequests" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN "acceptsOrganizerRequests" BOOLEAN NOT NULL DEFAULT false;

-- A pending request is live too: still at most one invited, requested or
-- active Appointment per person per Event or Venue.
DROP INDEX "appointments_one_live_per_event";
DROP INDEX "appointments_one_live_per_venue";

CREATE UNIQUE INDEX "appointments_one_live_per_event" ON "appointments"("eventId", "userId")
    WHERE "eventId" IS NOT NULL AND "status" IN ('invited', 'requested', 'active');

CREATE UNIQUE INDEX "appointments_one_live_per_venue" ON "appointments"("venueId", "userId")
    WHERE "venueId" IS NOT NULL AND "status" IN ('invited', 'requested', 'active');
