-- AlterTable
ALTER TABLE "asset_bookings" ADD COLUMN     "disputeAt" TIMESTAMP(3),
ADD COLUMN     "disputeReason" TEXT;

-- AlterTable
ALTER TABLE "service_bookings" ADD COLUMN     "disputeAt" TIMESTAMP(3),
ADD COLUMN     "disputeReason" TEXT;
