-- When the daily sweep flagged an Event for review: it ended with bookings and
-- nobody checked in. Null = never flagged.
ALTER TABLE "events" ADD COLUMN "reviewFlaggedAt" TIMESTAMP(3);
