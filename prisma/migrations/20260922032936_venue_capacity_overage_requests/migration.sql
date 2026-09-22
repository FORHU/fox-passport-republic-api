-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_assetTransactionId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_initiatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_serviceTransactionId_fkey";

-- AlterTable
ALTER TABLE "event_venue_transactions" ADD COLUMN     "confirmationDeadline" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "extraGuestRate" DECIMAL(12,2);
