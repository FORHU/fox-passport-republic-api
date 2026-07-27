-- Add citizenId to User table
ALTER TABLE "User" ADD COLUMN "citizenId" TEXT;
CREATE UNIQUE INDEX "User_citizenId_key" ON "User"("citizenId");

-- Backfill existing users with generated citizen IDs
-- Format: FX-{year}-{zero-padded sequential number}
WITH numbered AS (
  SELECT id, EXTRACT(YEAR FROM "createdAt")::INT AS yr,
         ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
  FROM "User"
  WHERE "citizenId" IS NULL
)
UPDATE "User"
SET "citizenId" = 'FX-' || numbered.yr || '-' || LPAD(numbered.rn::TEXT, 5, '0')
FROM numbered
WHERE "User".id = numbered.id;
