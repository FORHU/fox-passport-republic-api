-- Add venue ownership on files (replaces venues.imgIds array).
ALTER TABLE "files" ADD COLUMN "venueId" TEXT;

-- Point files at the venue that listed them in imgIds.
UPDATE "files" AS f
SET "venueId" = v."id"
FROM "venues" AS v
WHERE f."id" = ANY (v."imgIds");

ALTER TABLE "venues" DROP COLUMN "imgIds";

CREATE INDEX "files_venueId_idx" ON "files"("venueId");

ALTER TABLE "files" ADD CONSTRAINT "files_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
