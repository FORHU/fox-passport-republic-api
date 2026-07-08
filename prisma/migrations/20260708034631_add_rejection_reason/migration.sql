-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "rejectionReason" TEXT;
