-- Extends Foxer-owned promotions to Venue Foxers, and adds per-event
-- discount tracking for the direct-venue-booking path only (a template-based
-- Event's discount stays at the aggregate Invoice level).

ALTER TABLE "events"
  ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "voucherId" TEXT;

ALTER TABLE "promotions"
  ADD COLUMN "venueId" TEXT;
