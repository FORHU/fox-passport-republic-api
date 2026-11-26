-- api#423: Years of Experience caps at 30. An applicant claiming more (up to
-- 50) attaches a CV with references; the claim is kept in "claimedExperience"
-- so an admin who lowers "experience" to 30 can restore it later.
-- Nullable columns only: no backfill, no lock beyond the ALTER itself.

-- AlterTable
ALTER TABLE "provider_foxer_applications"
  ADD COLUMN "claimedExperience" INTEGER,
  ADD COLUMN "portfolioFileId" TEXT;

-- AlterTable
ALTER TABLE "organizer_applications"
  ADD COLUMN "claimedExperience" INTEGER,
  ADD COLUMN "portfolioFileId" TEXT;

-- AlterTable
ALTER TABLE "event_foxer_applications"
  ADD COLUMN "claimedExperience" INTEGER;

-- AddForeignKey
ALTER TABLE "provider_foxer_applications" ADD CONSTRAINT "provider_foxer_applications_portfolioFileId_fkey" FOREIGN KEY ("portfolioFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_applications" ADD CONSTRAINT "organizer_applications_portfolioFileId_fkey" FOREIGN KEY ("portfolioFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
