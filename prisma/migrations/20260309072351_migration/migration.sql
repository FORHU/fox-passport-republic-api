-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'mayor', 'investor', 'foxer', 'admin');

-- CreateEnum
CREATE TYPE "VenueType" AS ENUM ('hotel', 'resort', 'hall', 'garden', 'beach', 'rooftop', 'other');

-- CreateEnum
CREATE TYPE "VenueStatus" AS ENUM ('draft', 'pending_review', 'published', 'suspended', 'archived');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VerificationDocumentType" AS ENUM ('land_title', 'tax_declaration', 'deed_of_sale', 'lease_contract', 'other');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('equipment', 'furniture', 'decoration', 'other');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('fixed_infrastructure', 'warehouse_stored');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('new', 'good', 'fair', 'refurbishment');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('available', 'reserved', 'unavailable');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('planning', 'decoration', 'catering', 'photography', 'videography', 'entertainment', 'coordination', 'other');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('active', 'paused', 'unavailable');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('corporate', 'celebration', 'private_experience', 'popup', 'other');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'published', 'ongoing', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('draft', 'pending', 'confirmed', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'failed', 'refunded');

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "users" (
========
CREATE TABLE "User" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "profileImage" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "isFoxer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "venues" (
========
CREATE TABLE "Venue" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "VenueType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "VenueStatus" NOT NULL DEFAULT 'draft',
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL,
    "spaceType" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "techAv" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "staffing" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "policies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "venue_images" (
========
CREATE TABLE "VenueImage" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "orderIndex" INTEGER,
    "isThumbnail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VenueImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "VenueVerification" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "documentType" "VerificationDocumentType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "adminNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
========
CREATE TABLE "Asset" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "propertyType" TEXT,
    "roomType" TEXT,
    "capacity" INTEGER,
    "maxAttendees" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "categories" (
========
CREATE TABLE "Category" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentCategoryId" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "asset_images" (
========
CREATE TABLE "AssetImage" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "altText" TEXT,
    "orderIndex" INTEGER,
    "isThumbnail" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AssetImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "services" (
========
CREATE TABLE "Service" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "events" (
========
CREATE TABLE "Event" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "eventType" "EventType" NOT NULL,
    "startDatetime" TIMESTAMP(3) NOT NULL,
    "endDatetime" TIMESTAMP(3) NOT NULL,
    "maxAttendees" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" "EventStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "event_assets" (
========
CREATE TABLE "EventAsset" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "EventAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "event_services" (
========
CREATE TABLE "EventService" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "agreedPrice" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "EventService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "bookings" (
========
CREATE TABLE "Booking" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "confirmationCode" TEXT,
    "stampsEarned" INTEGER NOT NULL DEFAULT 0,
    "currentStep" INTEGER DEFAULT 1,
    "status" "BookingStatus" NOT NULL DEFAULT 'pending',
    "specialRequests" TEXT,
    "start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "payments" (
========
CREATE TABLE "Payment" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionId" TEXT,
    "gatewayResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "booking_attendees" (
========
CREATE TABLE "BookingAttendee" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "ticketCode" TEXT NOT NULL,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "checkInTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingAttendee_pkey" PRIMARY KEY ("id")
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
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "reviews" (
========
CREATE TABLE "Review" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "venueId" TEXT,
    "eventId" TEXT,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isVerifiedAttendee" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE TABLE "favorites" (
========
CREATE TABLE "Favorite" (
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "venueId" TEXT,
    "eventId" TEXT,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
CREATE UNIQUE INDEX "VenueVerification_venueId_key" ON "VenueVerification"("venueId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");
========
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql

-- CreateIndex
CREATE UNIQUE INDEX "EventAsset_eventId_assetId_key" ON "EventAsset"("eventId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "EventService_eventId_serviceId_key" ON "EventService"("eventId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_confirmationCode_key" ON "Booking"("confirmationCode");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAttendee_ticketCode_key" ON "BookingAttendee"("ticketCode");

-- CreateIndex
CREATE UNIQUE INDEX "Passport_userId_key" ON "Passport"("userId");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueImage" ADD CONSTRAINT "VenueImage_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
<<<<<<<< HEAD:prisma/migrations/20260309072351_migration/migration.sql
ALTER TABLE "VenueVerification" ADD CONSTRAINT "VenueVerification_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueVerification" ADD CONSTRAINT "VenueVerification_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueVerification" ADD CONSTRAINT "VenueVerification_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
========
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
>>>>>>>> 394cacbeb323618e190009eea7af13b97ad3722d:prisma/migrations/20260119052412_init_fix/migration.sql

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetImage" ADD CONSTRAINT "AssetImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAsset" ADD CONSTRAINT "EventAsset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAsset" ADD CONSTRAINT "EventAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventService" ADD CONSTRAINT "EventService_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventService" ADD CONSTRAINT "EventService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttendee" ADD CONSTRAINT "BookingAttendee_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passport" ADD CONSTRAINT "Passport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
