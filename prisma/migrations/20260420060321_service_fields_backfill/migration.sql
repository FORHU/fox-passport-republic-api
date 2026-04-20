/*
  Warnings:

  - You are about to drop the column `imgId` on the `services` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "files" ADD COLUMN     "serviceId" TEXT;

-- AlterTable
ALTER TABLE "services" DROP COLUMN "imgId",
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isWillingToTravel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "status" SET DEFAULT 'draft';

-- Backfill existing rows before enforcing NOT NULL
UPDATE "services"
SET
  "city" = COALESCE("city", 'Unknown City'),
  "country" = COALESCE("country", 'Unknown Country');

ALTER TABLE "services"
ALTER COLUMN "city" SET NOT NULL,
ALTER COLUMN "country" SET NOT NULL;

-- CreateIndex
CREATE INDEX "files_serviceId_idx" ON "files"("serviceId");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
