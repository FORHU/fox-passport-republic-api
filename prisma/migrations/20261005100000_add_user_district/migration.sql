-- The profile address gains an optional finer level under city: the barangay
-- in the Philippines, a district or neighbourhood elsewhere.
ALTER TABLE "users" ADD COLUMN "district" TEXT;
