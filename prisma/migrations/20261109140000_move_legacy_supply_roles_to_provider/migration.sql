-- Fold the legacy supply roles (gearFoxer, serviceFoxer, performerFoxer) into
-- providerFoxer (#228, #273). This migration only MOVES data; the next one
-- (20261109140100_drop_legacy_supply_roles) drops the old enum values and
-- tables once nothing points at them.
--
-- Safe to re-run: every statement only touches rows still holding a legacy
-- value, and every insert skips rows already moved.
--
-- LEDGER EXCEPTION (reward_events): the XP/Coins ledger is append-only. This
-- migration rewrites ONLY the `path` label of legacy rows to providerFoxer, so
-- the enum value can be dropped. Amounts, users, actions, refs, idempotency
-- keys and timestamps are untouched, and no row is added or deleted. This is a
-- one-off, recorded in docs/adr/0008-retire-legacy-supply-roles.md.

-- 1. Applications: copy each legacy application into provider_foxer_applications
--    under the same request (and the same id), so KYC history and document
--    links survive the table drop.
INSERT INTO "provider_foxer_applications" (
  "id", "requestId", "businessName", "assetTypes", "specializations",
  "tinNumber", "validId1FileId", "nbiFileId", "tinIdFileId",
  "birPermitFileId", "selfieFileId", "createdAt", "updatedAt"
)
SELECT
  "id", "requestId", "businessName", "assetTypes", "specializations",
  "tinNumber", "validId1FileId", "nbiFileId", "tinIdFileId",
  "birPermitFileId", "selfieFileId", "createdAt", "updatedAt"
FROM "gear_foxer_applications"
ON CONFLICT ("requestId") DO NOTHING;

INSERT INTO "provider_foxer_applications" (
  "id", "requestId", "serviceTypes", "specializations", "portfolioUrls",
  "experience", "nbiClearanceIdNumber", "tinNumber", "validId1FileId",
  "nbiFileId", "tinIdFileId", "birPermitFileId", "selfieFileId",
  "createdAt", "updatedAt"
)
SELECT
  "id", "requestId", "serviceTypes", "specializations", "portfolioUrls",
  "experience", "nbiClearanceIdNumber", "tinNumber", "validId1FileId",
  "nbiFileId", "tinIdFileId", "birPermitFileId", "selfieFileId",
  "createdAt", "updatedAt"
FROM "service_foxer_applications"
ON CONFLICT ("requestId") DO NOTHING;

-- Performer types are performer-category services, so they land in serviceTypes.
INSERT INTO "provider_foxer_applications" (
  "id", "requestId", "serviceTypes", "specializations", "portfolioUrls",
  "experience", "nbiClearanceIdNumber", "tinNumber", "validId1FileId",
  "nbiFileId", "tinIdFileId", "birPermitFileId", "selfieFileId",
  "createdAt", "updatedAt"
)
SELECT
  "id", "requestId", "performerTypes", "specializations", "portfolioUrls",
  "experience", "nbiClearanceIdNumber", "tinNumber", "validId1FileId",
  "nbiFileId", "tinIdFileId", "birPermitFileId", "selfieFileId",
  "createdAt", "updatedAt"
FROM "performer_foxer_applications"
ON CONFLICT ("requestId") DO NOTHING;

-- 2. Role requests: every legacy request (any status) becomes a Provider one.
UPDATE "role_requests"
SET "roleType" = 'providerFoxer'
WHERE "roleType" IN ('gearFoxer', 'serviceFoxer', 'performerFoxer');

-- 3. Users: swap any legacy role for providerFoxer, once, keeping the others
--    in their original order.
UPDATE "users" u
SET "roleType" = (
  SELECT array_agg(r ORDER BY first_pos)
  FROM (
    SELECT
      CASE WHEN x.r IN ('gearFoxer', 'serviceFoxer', 'performerFoxer')
        THEN 'providerFoxer'::"RoleType" ELSE x.r END AS r,
      MIN(x.pos) AS first_pos
    FROM unnest(u."roleType") WITH ORDINALITY AS x(r, pos)
    GROUP BY 1
  ) mapped
)
WHERE u."roleType" && ARRAY['gearFoxer', 'serviceFoxer', 'performerFoxer']::"RoleType"[];

-- 4. Foxer specializations: re-key to providerFoxer, dropping duplicates.
INSERT INTO "foxer_specializations" ("id", "userId", "roleType", "category", "source", "createdAt")
SELECT DISTINCT ON ("userId", "category")
  gen_random_uuid()::TEXT, "userId", 'providerFoxer'::"RoleType", "category", "source", "createdAt"
FROM "foxer_specializations"
WHERE "roleType" IN ('gearFoxer', 'serviceFoxer', 'performerFoxer')
-- An "earned" specialization outranks a "declared" one for the same category.
ORDER BY "userId", "category", ("source" = 'earned') DESC, "createdAt"
ON CONFLICT ("userId", "roleType", "category") DO NOTHING;

DELETE FROM "foxer_specializations"
WHERE "roleType" IN ('gearFoxer', 'serviceFoxer', 'performerFoxer');

-- 5. Passport paths: merge every legacy supply path (and any existing Provider
--    path) into one providerFoxer path per passport. XP adds up; the level is
--    recomputed with the API's curve (PassportSvc.calculateLevel: 250 XP for
--    level 2, x1.12 per level, flat after level 25).
CREATE OR REPLACE FUNCTION "_fp_xp_required_for_level"(lvl INT) RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  total NUMERIC := 0;
  i INT;
BEGIN
  IF lvl <= 1 THEN RETURN 0; END IF;
  FOR i IN 1..(lvl - 1) LOOP
    total := total + round(250 * power(1.12::NUMERIC, LEAST(i, 25) - 1));
  END LOOP;
  RETURN total::INT;
END $$;

CREATE OR REPLACE FUNCTION "_fp_level_for_xp"(xp INT) RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  lvl INT := 1;
BEGIN
  WHILE xp >= "_fp_xp_required_for_level"(lvl + 1) LOOP
    lvl := lvl + 1;
  END LOOP;
  RETURN lvl;
END $$;

WITH merged AS (
  SELECT
    "passportId",
    SUM("totalXP")::INT AS total_xp,
    MIN("createdAt") AS created_at
  FROM "passport_paths"
  WHERE "path" IN ('gearFoxer', 'serviceFoxer', 'performerFoxer', 'providerFoxer')
  GROUP BY "passportId"
  HAVING bool_or("path" IN ('gearFoxer', 'serviceFoxer', 'performerFoxer'))
)
INSERT INTO "passport_paths" ("id", "passportId", "path", "level", "currentXP", "totalXP", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::TEXT,
  m."passportId",
  'providerFoxer',
  "_fp_level_for_xp"(m.total_xp),
  m.total_xp - "_fp_xp_required_for_level"("_fp_level_for_xp"(m.total_xp)),
  m.total_xp,
  m.created_at,
  NOW()
FROM merged m
ON CONFLICT ("passportId", "path") DO UPDATE SET
  "level" = EXCLUDED."level",
  "currentXP" = EXCLUDED."currentXP",
  "totalXP" = EXCLUDED."totalXP",
  "createdAt" = LEAST("passport_paths"."createdAt", EXCLUDED."createdAt"),
  "updatedAt" = NOW();

DELETE FROM "passport_paths"
WHERE "path" IN ('gearFoxer', 'serviceFoxer', 'performerFoxer');

DROP FUNCTION "_fp_level_for_xp"(INT);
DROP FUNCTION "_fp_xp_required_for_level"(INT);

-- 6. Badges: legacy-path badges become Provider badges.
UPDATE "badges"
SET "path" = 'providerFoxer'
WHERE "path" IN ('gearFoxer', 'serviceFoxer', 'performerFoxer');

-- 7. Ledger (see LEDGER EXCEPTION above): relabel the path only.
UPDATE "reward_events"
SET "path" = 'providerFoxer'
WHERE "path" IN ('gearFoxer', 'serviceFoxer', 'performerFoxer');
