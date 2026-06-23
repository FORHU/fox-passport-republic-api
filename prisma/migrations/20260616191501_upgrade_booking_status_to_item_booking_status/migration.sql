-- Upgrade Booking.status from BookingStatus (pending/confirmed/cancelled/completed)
-- to ItemBookingStatus (pending/confirmed/active/completed/cancelled/disputed), giving
-- the Event-flow Booking the same active/disputed lifecycle AssetBooking/ServiceBooking
-- already have (confirmArrival/dispute, payout-on-completed). Every existing
-- BookingStatus value is also a valid ItemBookingStatus value, so this is data-safe.
--
-- Hand-written instead of using Prisma's default diff, which proposed
-- DROP COLUMN + ADD COLUMN DEFAULT 'pending' and would have wiped every existing
-- booking's actual status.

ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "ItemBookingStatus" USING ("status"::text::"ItemBookingStatus");
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'pending';
