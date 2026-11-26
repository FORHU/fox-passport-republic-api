-- A stamp will name a Venue or a Place (decided 2026-11-26), so its venue is
-- no longer required. The venue deletion protection from
-- 20261126120000_venue_rule_constraints (ON DELETE RESTRICT) stays.
ALTER TABLE "passport_stamps" ALTER COLUMN "venueId" DROP NOT NULL;
