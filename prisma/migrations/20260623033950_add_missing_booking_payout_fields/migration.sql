<<<<<<< Updated upstream
-- AlterTable (safe: columns may already exist from a prior migration)
=======
-- AlterTable
>>>>>>> Stashed changes
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "hostMarkup" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "asset_bookings" ADD COLUMN IF NOT EXISTS "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
<<<<<<< Updated upstream
ALTER TABLE "service_bookings" ADD COLUMN IF NOT EXISTS "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
=======
ALTER TABLE "service_bookings" ADD COLUMN IF NOT EXISTS "platformFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
>>>>>>> Stashed changes
