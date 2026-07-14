-- Add perks array to Passport model
ALTER TABLE "Passport" ADD COLUMN "perks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
