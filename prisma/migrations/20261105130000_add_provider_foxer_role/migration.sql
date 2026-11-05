-- The schema half of #230 ("consolidate supply roles into unified
-- providerFoxer", commit ef2ca8f) shipped without a migration: it added the
-- `providerFoxer` RoleType/UserPath value and the ProviderFoxerApplication
-- model, but nothing created them. Any database built from migrations was
-- missing `provider_foxer_applications`, so every role-request query that
-- includes it (the admin list, "my applications", review) failed with P2021.
--
-- `IF NOT EXISTS` on the enum values and the table so this is a no-op on a
-- database someone already patched by hand (e.g. with `prisma db push`).

ALTER TYPE "RoleType" ADD VALUE IF NOT EXISTS 'providerFoxer';
ALTER TYPE "UserPath" ADD VALUE IF NOT EXISTS 'providerFoxer';

-- ProviderFoxerApplication, mirroring performer_foxer_applications.
CREATE TABLE IF NOT EXISTS "provider_foxer_applications" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "businessName" TEXT,
    "assetTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portfolioUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experience" INTEGER,
    "nbiClearanceIdNumber" TEXT,
    "tinNumber" TEXT,
    "validId1FileId" TEXT,
    "nbiFileId" TEXT,
    "tinIdFileId" TEXT,
    "birPermitFileId" TEXT,
    "selfieFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_foxer_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "provider_foxer_applications_requestId_key" ON "provider_foxer_applications"("requestId");

-- Constraints have no IF NOT EXISTS; skip each one that already exists.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_foxer_applications_requestId_fkey') THEN
    ALTER TABLE "provider_foxer_applications" ADD CONSTRAINT "provider_foxer_applications_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_foxer_applications_validId1FileId_fkey') THEN
    ALTER TABLE "provider_foxer_applications" ADD CONSTRAINT "provider_foxer_applications_validId1FileId_fkey" FOREIGN KEY ("validId1FileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_foxer_applications_nbiFileId_fkey') THEN
    ALTER TABLE "provider_foxer_applications" ADD CONSTRAINT "provider_foxer_applications_nbiFileId_fkey" FOREIGN KEY ("nbiFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_foxer_applications_tinIdFileId_fkey') THEN
    ALTER TABLE "provider_foxer_applications" ADD CONSTRAINT "provider_foxer_applications_tinIdFileId_fkey" FOREIGN KEY ("tinIdFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_foxer_applications_birPermitFileId_fkey') THEN
    ALTER TABLE "provider_foxer_applications" ADD CONSTRAINT "provider_foxer_applications_birPermitFileId_fkey" FOREIGN KEY ("birPermitFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_foxer_applications_selfieFileId_fkey') THEN
    ALTER TABLE "provider_foxer_applications" ADD CONSTRAINT "provider_foxer_applications_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
