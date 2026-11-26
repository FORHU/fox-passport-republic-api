-- Every event has a venue (epic api#477, api#482). Hand-written; review before
-- applying to a shared database.
--
-- 1. A stamp's venue can't be null. Fill a missing one from its own booking's
--    approved venue only; never pick one. If any stamp is still without a
--    venue, stop: run `pnpm seed:venues` (seeded data) or fix it by hand.
UPDATE "passport_stamps" s
SET "venueId" = v."venueId"
FROM (
  SELECT DISTINCT ON ("bookingId") "bookingId", "venueId"
  FROM "event_venue_transactions"
  WHERE "bookingId" IS NOT NULL AND "included" AND "status" = 'approved'
  ORDER BY "bookingId", "createdAt"
) v
WHERE s."venueId" IS NULL AND v."bookingId" = s."bookingId";

DO $$
DECLARE missing integer;
BEGIN
  SELECT count(*) INTO missing FROM "passport_stamps" WHERE "venueId" IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'api#482: % passport stamp(s) have no venue. Run `pnpm seed:venues` for seeded data, or give each its venue by hand, then deploy again.', missing;
  END IF;
END $$;

ALTER TABLE "passport_stamps" ALTER COLUMN "venueId" SET NOT NULL;

-- 2. A venue in use by a stamp or a package can't be deleted into a missing
--    link (it used to set the link to null).
ALTER TABLE "passport_stamps" DROP CONSTRAINT "passport_stamps_venueId_fkey";
ALTER TABLE "passport_stamps" ADD CONSTRAINT "passport_stamps_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event_template_venues" DROP CONSTRAINT "event_template_venues_venueId_fkey";
ALTER TABLE "event_template_venues" ADD CONSTRAINT "event_template_venues_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
