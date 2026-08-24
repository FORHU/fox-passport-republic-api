-- AlterTable
ALTER TABLE "EventFoxerApplication" ALTER COLUMN "specializations" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "GearFoxerApplication" ALTER COLUMN "specializations" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ServiceFoxerApplication" ALTER COLUMN "specializations" DROP DEFAULT;

-- AlterTable
ALTER TABLE "VenueFoxerApplication" ALTER COLUMN "specializations" DROP DEFAULT;

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;
