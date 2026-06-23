/*
  Warnings:

  - The `status` column on the `Booking` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `hostMarkupPercent` on the `EventTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `stripeAccountId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `stripeOnboardingComplete` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[stripePaymentId]` on the table `Booking` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeTransferId]` on the table `EventAssetTransaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeTransferId]` on the table `EventServiceTransaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeTransferId]` on the table `EventVenueTransaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripeCustomerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripedConnectedId]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripePaymentId]` on the table `asset_bookings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[stripePaymentId]` on the table `service_bookings` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `stripePaymentId` to the `Booking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `disputeAt` to the `EventAssetTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `disputeReason` to the `EventAssetTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripeTransferId` to the `EventAssetTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `disputeAt` to the `EventServiceTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `disputeReason` to the `EventServiceTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripeTransferId` to the `EventServiceTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `disputeAt` to the `EventVenueTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `disputeReason` to the `EventVenueTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripeTransferId` to the `EventVenueTransaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripeCustomerId` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripedConnectedId` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripePaymentId` to the `asset_bookings` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stripePaymentId` to the `service_bookings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'active';
ALTER TYPE "BookingStatus" ADD VALUE 'disputed';

-- DropIndex
DROP INDEX "User_stripeAccountId_key";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "stripePaymentId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "BookingStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "EventAssetTransaction" ADD COLUMN     "disputeAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "disputeReason" TEXT NOT NULL,
ADD COLUMN     "stripeTransferId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EventServiceTransaction" ADD COLUMN     "disputeAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "disputeReason" TEXT NOT NULL,
ADD COLUMN     "stripeTransferId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "EventTemplate" DROP COLUMN "hostMarkupPercent",
ADD COLUMN     "hostMarkupPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "platformFeePct" DOUBLE PRECISION NOT NULL DEFAULT 0.05;

-- AlterTable
ALTER TABLE "EventVenueTransaction" ADD COLUMN     "disputeAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "disputeReason" TEXT NOT NULL,
ADD COLUMN     "stripeTransferId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "hostMarkupAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "platformFeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "stripeAccountId",
DROP COLUMN "stripeOnboardingComplete",
ADD COLUMN     "stripeCustomerId" TEXT NOT NULL,
ADD COLUMN     "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripedConnectedId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "asset_bookings" ADD COLUMN     "stripePaymentId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "service_bookings" ADD COLUMN     "stripePaymentId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_stripePaymentId_key" ON "Booking"("stripePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAssetTransaction_stripeTransferId_key" ON "EventAssetTransaction"("stripeTransferId");

-- CreateIndex
CREATE UNIQUE INDEX "EventServiceTransaction_stripeTransferId_key" ON "EventServiceTransaction"("stripeTransferId");

-- CreateIndex
CREATE UNIQUE INDEX "EventVenueTransaction_stripeTransferId_key" ON "EventVenueTransaction"("stripeTransferId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripedConnectedId_key" ON "User"("stripedConnectedId");

-- CreateIndex
CREATE UNIQUE INDEX "asset_bookings_stripePaymentId_key" ON "asset_bookings"("stripePaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "service_bookings_stripePaymentId_key" ON "service_bookings"("stripePaymentId");
