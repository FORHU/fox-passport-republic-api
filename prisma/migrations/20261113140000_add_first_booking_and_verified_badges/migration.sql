-- RR-7 (api#302): the "First Booking" and "Verified" badges. Data only; no
-- schema change.
--
-- Badge rows used to come only from the dev seeder, and awarding a badge whose
-- row is missing does nothing, so these two are inserted here to exist wherever
-- migrations run. Idempotent: a row that is already there is left alone.
INSERT INTO "badges" ("id", "name", "description", "icon", "color", "rarity", "path", "criteria", "updatedAt")
VALUES
  ('badge-first-booking', 'First Booking', 'Made your first paid booking', 'event_available', '#CCFF00', 'Common'::"BadgeRarity", 'user'::"UserPath", 'first_booking', CURRENT_TIMESTAMP),
  ('badge-verified', 'Verified', 'Your identity was verified', 'verified', '#4ADE80', 'Uncommon'::"BadgeRarity", 'user'::"UserPath", 'identity_verified', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

-- Badges only, never Tokens: people who were already verified, or had already
-- paid for a booking, get the badge. Only those with a passport are covered
-- here; a passport made later earns it on its next confirmed booking or review.
INSERT INTO "user_badges" ("id", "passportId", "badgeId", "earnedAt")
SELECT gen_random_uuid()::text, p."id", b."id", CURRENT_TIMESTAMP
FROM "passports" p
JOIN "users" u ON u."id" = p."userId"
JOIN "badges" b ON b."name" = 'Verified'
WHERE u."identityVerifiedAt" IS NOT NULL
ON CONFLICT ("passportId", "badgeId") DO NOTHING;

INSERT INTO "user_badges" ("id", "passportId", "badgeId", "earnedAt")
SELECT gen_random_uuid()::text, p."id", b."id", CURRENT_TIMESTAMP
FROM "passports" p
JOIN "badges" b ON b."name" = 'First Booking'
WHERE EXISTS (
  SELECT 1 FROM "bookings" k
  WHERE k."userId" = p."userId"
    AND k."status" IN ('confirmed', 'active', 'completed')
)
ON CONFLICT ("passportId", "badgeId") DO NOTHING;
