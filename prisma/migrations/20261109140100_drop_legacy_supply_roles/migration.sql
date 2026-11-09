-- Drop the legacy supply roles (gearFoxer, serviceFoxer, performerFoxer) and
-- their application tables. Runs after 20261109140000_move_legacy_supply_roles_to_provider,
-- which moved every row onto providerFoxer. IRREVERSIBLE: restore from a
-- backup to undo. See docs/adr/0008-retire-legacy-supply-roles.md.
--
-- Postgres cannot remove an enum value, so each enum is rebuilt without the
-- legacy values and its columns are cast across. The casts rewrite
-- users, role_requests, foxer_specializations, passport_paths, badges and
-- reward_events under an ACCESS EXCLUSIVE lock, held for the length of the
-- migration.

-- 0. Refuse to run if anything still holds a legacy value.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "roleType"::TEXT[] && ARRAY['gearFoxer', 'serviceFoxer', 'performerFoxer'])
    OR EXISTS (SELECT 1 FROM "role_requests" WHERE "roleType"::TEXT IN ('gearFoxer', 'serviceFoxer', 'performerFoxer'))
    OR EXISTS (SELECT 1 FROM "foxer_specializations" WHERE "roleType"::TEXT IN ('gearFoxer', 'serviceFoxer', 'performerFoxer'))
    OR EXISTS (SELECT 1 FROM "passport_paths" WHERE "path"::TEXT IN ('gearFoxer', 'serviceFoxer', 'performerFoxer'))
    OR EXISTS (SELECT 1 FROM "badges" WHERE "path"::TEXT IN ('gearFoxer', 'serviceFoxer', 'performerFoxer'))
    OR EXISTS (SELECT 1 FROM "reward_events" WHERE "path"::TEXT IN ('gearFoxer', 'serviceFoxer', 'performerFoxer'))
    OR EXISTS (
      SELECT 1 FROM "gear_foxer_applications" a
      WHERE NOT EXISTS (SELECT 1 FROM "provider_foxer_applications" p WHERE p."requestId" = a."requestId")
    )
    OR EXISTS (
      SELECT 1 FROM "service_foxer_applications" a
      WHERE NOT EXISTS (SELECT 1 FROM "provider_foxer_applications" p WHERE p."requestId" = a."requestId")
    )
    OR EXISTS (
      SELECT 1 FROM "performer_foxer_applications" a
      WHERE NOT EXISTS (SELECT 1 FROM "provider_foxer_applications" p WHERE p."requestId" = a."requestId")
    )
  THEN
    RAISE EXCEPTION 'Legacy supply-role data is still present; run 20261109140000_move_legacy_supply_roles_to_provider first';
  END IF;
END $$;

-- 1. The legacy application tables (their rows now live in provider_foxer_applications).
DROP TABLE "gear_foxer_applications";
DROP TABLE "service_foxer_applications";
DROP TABLE "performer_foxer_applications";

-- 2. RoleType without the legacy values.
ALTER TYPE "RoleType" RENAME TO "RoleType_old";
CREATE TYPE "RoleType" AS ENUM ('venueFoxer', 'eventFoxer', 'investor', 'organizer', 'providerFoxer');
ALTER TABLE "users"
  ALTER COLUMN "roleType" TYPE "RoleType"[] USING "roleType"::TEXT[]::"RoleType"[];
ALTER TABLE "role_requests"
  ALTER COLUMN "roleType" TYPE "RoleType" USING "roleType"::TEXT::"RoleType";
ALTER TABLE "foxer_specializations"
  ALTER COLUMN "roleType" TYPE "RoleType" USING "roleType"::TEXT::"RoleType";
DROP TYPE "RoleType_old";

-- 3. UserPath without the legacy values.
ALTER TYPE "UserPath" RENAME TO "UserPath_old";
CREATE TYPE "UserPath" AS ENUM ('user', 'eventFoxer', 'venueFoxer', 'investor', 'organizer', 'providerFoxer');
ALTER TABLE "passport_paths"
  ALTER COLUMN "path" TYPE "UserPath" USING "path"::TEXT::"UserPath";
ALTER TABLE "badges"
  ALTER COLUMN "path" TYPE "UserPath" USING "path"::TEXT::"UserPath";
ALTER TABLE "reward_events"
  ALTER COLUMN "path" TYPE "UserPath" USING "path"::TEXT::"UserPath";
DROP TYPE "UserPath_old";
