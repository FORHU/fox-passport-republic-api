-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "stripePaymentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EventAssetTransaction" ALTER COLUMN "stripeTransferId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EventServiceTransaction" ALTER COLUMN "stripeTransferId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "EventVenueTransaction" ALTER COLUMN "stripeTransferId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "asset_bookings" ALTER COLUMN "stripePaymentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "service_bookings" ALTER COLUMN "stripePaymentId" DROP NOT NULL;
