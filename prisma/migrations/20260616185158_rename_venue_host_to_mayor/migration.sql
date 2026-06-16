-- Rename Venue.hostId -> Venue.mayorId (Mayors create Venues, not Hosts; "host" was a
-- naming holdover from before Mayor existed as a separate role). Hand-written instead
-- of using Prisma's default diff, which proposed DROP COLUMN + ADD COLUMN NOT NULL and
-- would have destroyed every venue's owner link.

ALTER TABLE "venues" RENAME COLUMN "hostId" TO "mayorId";
ALTER TABLE "venues" RENAME CONSTRAINT "venues_hostId_fkey" TO "venues_mayorId_fkey";
