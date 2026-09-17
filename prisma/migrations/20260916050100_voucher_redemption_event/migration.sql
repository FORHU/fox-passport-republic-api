-- A direct venue booking's voucher redemption ties to its Event row (the
-- venue Booking flow has no Invoice/AssetBooking/ServiceBooking row of its
-- own to redeem against).

ALTER TABLE "voucher_redemptions"
  ADD COLUMN "eventId" TEXT;

CREATE UNIQUE INDEX "voucher_redemptions_eventId_key" ON "voucher_redemptions"("eventId");

ALTER TABLE "voucher_redemptions"
  ADD CONSTRAINT "voucher_redemptions_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "events"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
