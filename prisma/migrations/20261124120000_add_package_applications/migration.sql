-- Mayors and Providers apply to open packages with one of their listings
-- (api#460). New table and enums only; nothing existing changes.

-- CreateEnum
CREATE TYPE "PackageLineKind" AS ENUM ('asset', 'service', 'venue');

-- CreateEnum
CREATE TYPE "PackageApplicationStatus" AS ENUM ('pending', 'accepted', 'declined', 'withdrawn');

-- CreateTable
CREATE TABLE "package_applications" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "kind" "PackageLineKind" NOT NULL,
    "listingId" TEXT NOT NULL,
    "message" TEXT,
    "status" "PackageApplicationStatus" NOT NULL DEFAULT 'pending',
    "declineReason" "MatchDeclineReason",
    "declineNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "package_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "package_applications_templateId_status_idx" ON "package_applications"("templateId", "status");

-- CreateIndex
CREATE INDEX "package_applications_applicantId_idx" ON "package_applications"("applicantId");

-- AddForeignKey
ALTER TABLE "package_applications" ADD CONSTRAINT "package_applications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "event_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_applications" ADD CONSTRAINT "package_applications_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
