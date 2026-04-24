-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('asset', 'service', 'venue');

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('mayor', 'host', 'foxerAsset', 'foxerService', 'investor');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'pending', 'ongoing', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('new', 'good', 'fair', 'refurbished');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('draft', 'pending', 'available', 'reserved', 'archived', 'rejected');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('draft', 'pending', 'available', 'paused', 'archived', 'rejected');

-- CreateEnum
CREATE TYPE "VenueStatus" AS ENUM ('draft', 'pending', 'available', 'archived', 'rejected');

-- CreateEnum
CREATE TYPE "BillingRate" AS ENUM ('hourly', 'daily', 'weekly', 'monthly', 'yearly', 'one_time');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('corporate', 'fair', 'birthday', 'wedding', 'anniversary', 'graduation', 'other');

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
    "validId1FileId" TEXT,
    "nbiFileId" TEXT,
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
    "validId1FileId" TEXT,
    "nbiFileId" TEXT,
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

-- CreateTable
CREATE TABLE "HostApplication" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "bio" TEXT,
    "experience" TEXT,
    "location" TEXT,
    "validId1FileId" TEXT,
    "nbiFileId" TEXT,
    "tinIdFileId" TEXT,
    "birPermitFileId" TEXT,
    "selfieFileId" TEXT,
    "portfolioFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "venueId" TEXT,
    "assetId" TEXT,
    "serviceId" TEXT,
    "roleRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalStamps" INTEGER NOT NULL DEFAULT 0,
    "totalMileage" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "achievements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Passport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingRate" "BillingRate" NOT NULL,
    "condition" "AssetCondition" NOT NULL DEFAULT 'good',
    "status" "AssetStatus" NOT NULL DEFAULT 'available',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Unknown City',
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Unknown Country',
    "isWillingToTravel" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingRate" "BillingRate" NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "billingRate" "BillingRate" NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "status" "VenueStatus" NOT NULL DEFAULT 'draft',
    "spaceType" TEXT[],
    "amenities" TEXT[],
    "techAv" TEXT[],
    "staffing" TEXT[],
    "policies" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTemplate" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "EventType" NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_template_assets" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_template_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_template_services" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_template_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_template_venues" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_template_venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventClientRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "eventStatus" "EventStatus" NOT NULL DEFAULT 'pending',
    "requestStatus" "RequestStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventClientRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAssetTransaction" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "agreedPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "lockedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventAssetTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventServiceTransaction" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "agreedPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "lockedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventServiceTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventVenueTransaction" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "agreedPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "lockedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventVenueTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingAttendee" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "ticketCode" TEXT NOT NULL,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "transactionId" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_HostPortfolioMany" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_HostPortfolioMany_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EventTemplateImages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventTemplateImages_AB_pkey" PRIMARY KEY ("A","B")
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

-- CreateIndex
CREATE UNIQUE INDEX "HostApplication_requestId_key" ON "HostApplication"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Passport_userId_key" ON "Passport"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAttendee_ticketCode_key" ON "BookingAttendee"("ticketCode");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_entityId_entityType_key" ON "Review"("userId", "entityId", "entityType");

-- CreateIndex
CREATE INDEX "_HostPortfolioMany_B_index" ON "_HostPortfolioMany"("B");

-- CreateIndex
CREATE INDEX "_EventTemplateImages_B_index" ON "_EventTemplateImages"("B");

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_validId1FileId_fkey" FOREIGN KEY ("validId1FileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_nbiFileId_fkey" FOREIGN KEY ("nbiFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_tinIdFileId_fkey" FOREIGN KEY ("tinIdFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_birPermitFileId_fkey" FOREIGN KEY ("birPermitFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MayorApplication" ADD CONSTRAINT "MayorApplication_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_validId1FileId_fkey" FOREIGN KEY ("validId1FileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_nbiFileId_fkey" FOREIGN KEY ("nbiFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_tinIdFileId_fkey" FOREIGN KEY ("tinIdFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_birPermitFileId_fkey" FOREIGN KEY ("birPermitFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerAssetApplication" ADD CONSTRAINT "FoxerAssetApplication_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_validId1FileId_fkey" FOREIGN KEY ("validId1FileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_nbiFileId_fkey" FOREIGN KEY ("nbiFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_tinIdFileId_fkey" FOREIGN KEY ("tinIdFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_birPermitFileId_fkey" FOREIGN KEY ("birPermitFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoxerServiceApplication" ADD CONSTRAINT "FoxerServiceApplication_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorApplication" ADD CONSTRAINT "InvestorApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestorApplication" ADD CONSTRAINT "InvestorApplication_proofFileId_fkey" FOREIGN KEY ("proofFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostApplication" ADD CONSTRAINT "HostApplication_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostApplication" ADD CONSTRAINT "HostApplication_validId1FileId_fkey" FOREIGN KEY ("validId1FileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostApplication" ADD CONSTRAINT "HostApplication_nbiFileId_fkey" FOREIGN KEY ("nbiFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostApplication" ADD CONSTRAINT "HostApplication_tinIdFileId_fkey" FOREIGN KEY ("tinIdFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostApplication" ADD CONSTRAINT "HostApplication_birPermitFileId_fkey" FOREIGN KEY ("birPermitFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostApplication" ADD CONSTRAINT "HostApplication_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostApplication" ADD CONSTRAINT "HostApplication_portfolioFileId_fkey" FOREIGN KEY ("portfolioFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_roleRequestId_fkey" FOREIGN KEY ("roleRequestId") REFERENCES "role_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passport" ADD CONSTRAINT "Passport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTemplate" ADD CONSTRAINT "EventTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_template_assets" ADD CONSTRAINT "event_template_assets_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_template_assets" ADD CONSTRAINT "event_template_assets_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_template_services" ADD CONSTRAINT "event_template_services_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_template_services" ADD CONSTRAINT "event_template_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_template_venues" ADD CONSTRAINT "event_template_venues_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_template_venues" ADD CONSTRAINT "event_template_venues_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventClientRequest" ADD CONSTRAINT "EventClientRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventClientRequest" ADD CONSTRAINT "EventClientRequest_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventClientRequest" ADD CONSTRAINT "EventClientRequest_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetTransaction" ADD CONSTRAINT "EventAssetTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventClientRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetTransaction" ADD CONSTRAINT "EventAssetTransaction_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetTransaction" ADD CONSTRAINT "EventAssetTransaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventServiceTransaction" ADD CONSTRAINT "EventServiceTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventClientRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventServiceTransaction" ADD CONSTRAINT "EventServiceTransaction_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventServiceTransaction" ADD CONSTRAINT "EventServiceTransaction_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueTransaction" ADD CONSTRAINT "EventVenueTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventClientRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueTransaction" ADD CONSTRAINT "EventVenueTransaction_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueTransaction" ADD CONSTRAINT "EventVenueTransaction_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EventClientRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttendee" ADD CONSTRAINT "BookingAttendee_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HostPortfolioMany" ADD CONSTRAINT "_HostPortfolioMany_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HostPortfolioMany" ADD CONSTRAINT "_HostPortfolioMany_B_fkey" FOREIGN KEY ("B") REFERENCES "HostApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventTemplateImages" ADD CONSTRAINT "_EventTemplateImages_A_fkey" FOREIGN KEY ("A") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventTemplateImages" ADD CONSTRAINT "_EventTemplateImages_B_fkey" FOREIGN KEY ("B") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
