-- The Provider application wizard (mobile#487, api#440): where they are
-- based, how far they travel, their main specialty, and a description with
-- photos per specialty. New nullable columns and new tables only; existing
-- rows are unchanged.

-- CreateEnum
CREATE TYPE "ProviderTravelRange" AS ENUM ('city', 'province', 'anywhere');

-- AlterTable
ALTER TABLE "provider_foxer_applications" ADD COLUMN "basedIn" TEXT,
ADD COLUMN "basedInLat" DOUBLE PRECISION,
ADD COLUMN "basedInLng" DOUBLE PRECISION,
ADD COLUMN "travelRange" "ProviderTravelRange",
ADD COLUMN "mainSpecialty" TEXT;

-- CreateTable
CREATE TABLE "provider_application_specialties" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "provider_application_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_application_specialty_photos" (
    "id" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "provider_application_specialty_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provider_application_specialties_applicationId_slug_key" ON "provider_application_specialties"("applicationId", "slug");

-- CreateIndex
CREATE INDEX "provider_application_specialty_photos_specialtyId_idx" ON "provider_application_specialty_photos"("specialtyId");

-- CreateIndex
CREATE INDEX "provider_application_specialty_photos_fileId_idx" ON "provider_application_specialty_photos"("fileId");

-- AddForeignKey
ALTER TABLE "provider_application_specialties" ADD CONSTRAINT "provider_application_specialties_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "provider_foxer_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_application_specialty_photos" ADD CONSTRAINT "provider_application_specialty_photos_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "provider_application_specialties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_application_specialty_photos" ADD CONSTRAINT "provider_application_specialty_photos_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
