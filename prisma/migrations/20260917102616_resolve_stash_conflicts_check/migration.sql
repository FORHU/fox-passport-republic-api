-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_assetTransactionId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_initiatedByAdminId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_serviceTransactionId_fkey";
