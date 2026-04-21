/*
  Warnings:

  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('mayor', 'foxerAsset', 'foxerService', 'investor');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_userId_fkey";

-- DropForeignKey
ALTER TABLE "Favorite" DROP CONSTRAINT "Favorite_userId_fkey";

-- DropForeignKey
ALTER TABLE "Passport" DROP CONSTRAINT "Passport_userId_fkey";

-- DropForeignKey
ALTER TABLE "RenterAsset" DROP CONSTRAINT "RenterAsset_renterId_fkey";

-- DropForeignKey
ALTER TABLE "RenterService" DROP CONSTRAINT "RenterService_renterId_fkey";

-- DropForeignKey
ALTER TABLE "RenterVenue" DROP CONSTRAINT "RenterVenue_renterId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_userId_fkey";

-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_organizerId_fkey";

-- DropForeignKey
ALTER TABLE "files" DROP CONSTRAINT "files_uploadedBy_fkey";

-- DropForeignKey
ALTER TABLE "services" DROP CONSTRAINT "services_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "venues" DROP CONSTRAINT "venues_hostId_fkey";

-- DropTable
DROP TABLE "users";

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "phone" TEXT,
    "imgId" TEXT,
    "systemRole" "SystemRole" NOT NULL DEFAULT 'user',
    "roleType" "RoleType"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleType" "RoleType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MayorApplication" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tinNumber" TEXT NOT NULL,
    "description" TEXT,
    "validIdFileId" TEXT,
    "tinIdFileId" TEXT,
    "birPermitFileId" TEXT,
    "selfieFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MayorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoxerAssetApplication" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "assetTypes" TEXT[],
    "tinNumber" TEXT NOT NULL,
    "validIdFileId" TEXT,
    "tinIdFileId" TEXT,
    "birPermitFileId" TEXT,
    "selfieFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoxerAssetApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoxerServiceApplication" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "serviceTypes" TEXT[],
    "portfolioUrls" TEXT[],
    "experience" INTEGER NOT NULL,
    "nbiClearanceIdNumber" TEXT NOT NULL,
    "tinNumber" TEXT,
    "validId1FileId" TEXT,
    "validId2FileId" TEXT,
    "nbiFileId" TEXT,
    "tinIdFileId" TEXT,
    "birPermitFileId" TEXT,
    "selfieFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoxerServiceApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestorApplication" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "companyName" TEXT,
    "investmentRange" DOUBLE PRECISION NOT NULL,
    "interests" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "proofFileId" TEXT,

    CONSTRAINT "InvestorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "role_requests_userId_roleType_idx" ON "role_requests"("userId", "roleType");

-- CreateIndex
CREATE UNIQUE INDEX "MayorApplication_requestId_key" ON "MayorApplication"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FoxerAssetApplication_requestId_key" ON "FoxerAssetApplication"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FoxerServiceApplication_requestId_key" ON "FoxerServiceApplication"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestorApplication_requestId_key" ON "InvestorApplication"("requestId");

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_validIdFileId_fkey" FOREIGN KEY ("validIdFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_tinIdFileId_fkey" FOREIGN KEY ("tinIdFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_birPermitFileId_fkey" FOREIGN KEY ("birPermitFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_validIdFileId_fkey" FOREIGN KEY ("validIdFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_tinIdFileId_fkey" FOREIGN KEY ("tinIdFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_birPermitFileId_fkey" FOREIGN KEY ("birPermitFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_validId1FileId_fkey" FOREIGN KEY ("validId1FileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_validId2FileId_fkey" FOREIGN KEY ("validId2FileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_nbiFileId_fkey" FOREIGN KEY ("nbiFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_tinIdFileId_fkey" FOREIGN KEY ("tinIdFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_birPermitFileId_fkey" FOREIGN KEY ("birPermitFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorApplication" ADD CONSTRAINT "InvestorApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorApplication" ADD CONSTRAINT "InvestorApplication_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passport" ADD CONSTRAINT "Passport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenterAsset" ADD CONSTRAINT "RenterAsset_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenterService" ADD CONSTRAINT "RenterService_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenterVenue" ADD CONSTRAINT "RenterVenue_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
