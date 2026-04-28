/*
  Warnings:

  - You are about to drop the column `name` on the `event_template_assets` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `event_template_services` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `event_template_venues` table. All the data in the column will be lost.
  - You are about to drop the `EventClientRequest` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `category` on the `EventTemplate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `paymentType` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `category` on the `services` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "MatchConstraint" AS ENUM ('SAME_STATE', 'BROADER', 'MANUAL_OVERRIDE', 'NONE');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('design', 'catering', 'entertainment', 'service_staff', 'other');

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('furnitures', 'sound_system', 'decorations', 'other');

-- CreateEnum
CREATE TYPE "VenueCategory" AS ENUM ('indoor', 'outdoor', 'mix', 'hotel', 'beach_resort', 'garden', 'other');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('deposit', 'full');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('corporate', 'birthday', 'wedding', 'social', 'other');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'declined');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'cancelled';

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventAssetTransaction" DROP CONSTRAINT "EventAssetTransaction_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventClientRequest" DROP CONSTRAINT "EventClientRequest_clientId_fkey";

-- DropForeignKey
ALTER TABLE "EventClientRequest" DROP CONSTRAINT "EventClientRequest_organizerId_fkey";

-- DropForeignKey
ALTER TABLE "EventClientRequest" DROP CONSTRAINT "EventClientRequest_templateId_fkey";

-- DropForeignKey
ALTER TABLE "EventServiceTransaction" DROP CONSTRAINT "EventServiceTransaction_eventId_fkey";

-- DropForeignKey
ALTER TABLE "EventVenueTransaction" DROP CONSTRAINT "EventVenueTransaction_eventId_fkey";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "isGuestListLocked" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BookingAttendee" ADD COLUMN     "inviteStatus" "InviteStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "isDraft" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reasonForRejection" TEXT,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "ticketCode" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EventAssetTransaction" ADD COLUMN     "bookingId" TEXT;

-- AlterTable
ALTER TABLE "EventServiceTransaction" ADD COLUMN     "bookingId" TEXT;

-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "targetCity" TEXT,
ADD COLUMN     "targetCountry" TEXT DEFAULT 'Philippines',
ADD COLUMN     "targetState" TEXT,
DROP COLUMN "category",
ADD COLUMN     "category" "EventCategory" NOT NULL;

-- AlterTable
ALTER TABLE "EventVenueTransaction" ADD COLUMN     "bookingId" TEXT;

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "paymentType" "PaymentType" NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "paidAt" DROP NOT NULL,
ALTER COLUMN "paidAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'Philippines',
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'Philippines',
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "event_template_assets" DROP COLUMN "name",
ADD COLUMN     "date" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "matchConstraint" "MatchConstraint" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "matched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "matchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_template_services" DROP COLUMN "name",
ADD COLUMN     "date" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "matchConstraint" "MatchConstraint" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "matched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "matchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "event_template_venues" DROP COLUMN "name",
ADD COLUMN     "date" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "matchConstraint" "MatchConstraint" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "matched" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "matchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "services" DROP COLUMN "category",
ADD COLUMN     "category" "ServiceCategory" NOT NULL;

-- DropTable
DROP TABLE "EventClientRequest";

-- DropEnum
DROP TYPE "EventType";

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "eventCategory" "EventCategory" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "eventStatus" "EventStatus" NOT NULL DEFAULT 'pending',
    "requestStatus" "RequestStatus" NOT NULL DEFAULT 'pending',
    "targetCity" TEXT,
    "targetState" TEXT,
    "targetCountry" TEXT DEFAULT 'Philippines',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetTransaction" ADD CONSTRAINT "EventAssetTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetTransaction" ADD CONSTRAINT "EventAssetTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventServiceTransaction" ADD CONSTRAINT "EventServiceTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventServiceTransaction" ADD CONSTRAINT "EventServiceTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueTransaction" ADD CONSTRAINT "EventVenueTransaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventVenueTransaction" ADD CONSTRAINT "EventVenueTransaction_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttendee" ADD CONSTRAINT "BookingAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingAttendee" ADD CONSTRAINT "BookingAttendee_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
