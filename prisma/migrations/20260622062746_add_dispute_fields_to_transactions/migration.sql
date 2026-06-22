-- AlterTable
ALTER TABLE "EventAssetTransaction" ALTER COLUMN "disputeAt" DROP NOT NULL,
ALTER COLUMN "disputeReason" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EventServiceTransaction" ALTER COLUMN "disputeAt" DROP NOT NULL,
ALTER COLUMN "disputeReason" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EventVenueTransaction" ALTER COLUMN "disputeAt" DROP NOT NULL,
ALTER COLUMN "disputeReason" DROP NOT NULL;
