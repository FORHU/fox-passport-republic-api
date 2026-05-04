-- AlterTable
ALTER TABLE "EventAssetTransaction" ADD COLUMN     "included" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "EventServiceTransaction" ADD COLUMN     "included" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "EventVenueTransaction" ADD COLUMN     "included" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "event_template_assets" ADD COLUMN     "agreedPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "isOptional" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "event_template_services" ADD COLUMN     "agreedPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "isOptional" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "event_template_venues" ADD COLUMN     "agreedPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "isOptional" BOOLEAN NOT NULL DEFAULT false;
