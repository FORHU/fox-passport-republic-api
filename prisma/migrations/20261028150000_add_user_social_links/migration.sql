-- Links to a person's other social accounts, shown on their public profile.
-- Nullable, so existing rows need no backfill.
ALTER TABLE "users" ADD COLUMN "socialLinks" JSONB;
