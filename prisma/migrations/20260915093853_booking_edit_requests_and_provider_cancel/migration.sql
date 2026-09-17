-- CreateEnum
CREATE TYPE "BookingEditRequestStatus" AS ENUM ('pending', 'approved', 'declined', 'withdrawn', 'expired');

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_paymentId_fkey";

-- AlterTable
ALTER TABLE "asset_bookings" ADD COLUMN     "providerCancelReason" TEXT,
ADD COLUMN     "providerCancelledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "assetBookingId" TEXT,
ADD COLUMN     "serviceBookingId" TEXT,
ALTER COLUMN "paymentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "service_bookings" ADD COLUMN     "providerCancelReason" TEXT,
ADD COLUMN     "providerCancelledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "booking_edit_requests" (
    "id" TEXT NOT NULL,
    "assetBookingId" TEXT,
    "serviceBookingId" TEXT,
    "requestedById" TEXT NOT NULL,
    "status" "BookingEditRequestStatus" NOT NULL DEFAULT 'pending',
    "proposedQuantity" INTEGER,
    "proposedGuestCount" INTEGER,
    "proposedStartDate" TIMESTAMP(3),
    "proposedEndDate" TIMESTAMP(3),
    "currentTotalAmount" DECIMAL(12,2) NOT NULL,
    "proposedTotalAmount" DECIMAL(12,2) NOT NULL,
    "priceDelta" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "declineReason" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "deltaPaymentIntentId" TEXT,
    "deltaRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_edit_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "booking_edit_requests" ADD CONSTRAINT "booking_edit_requests_assetBookingId_fkey" FOREIGN KEY ("assetBookingId") REFERENCES "asset_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_edit_requests" ADD CONSTRAINT "booking_edit_requests_serviceBookingId_fkey" FOREIGN KEY ("serviceBookingId") REFERENCES "service_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_edit_requests" ADD CONSTRAINT "booking_edit_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_assetBookingId_fkey" FOREIGN KEY ("assetBookingId") REFERENCES "asset_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_serviceBookingId_fkey" FOREIGN KEY ("serviceBookingId") REFERENCES "service_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
