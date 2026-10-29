-- A short bio on the public profile. Nullable, so existing rows need no
-- backfill and the old app version keeps working.
ALTER TABLE "users" ADD COLUMN "bio" TEXT;
