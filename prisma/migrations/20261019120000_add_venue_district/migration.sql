-- A venue gains the same optional level under city as a user profile: the
-- barangay in the Philippines, a district or neighbourhood elsewhere.
ALTER TABLE "venues" ADD COLUMN "district" TEXT;
