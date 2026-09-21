-- AlterTable
ALTER TABLE "booking_edit_requests" ADD COLUMN     "bookingId" TEXT;

-- AddForeignKey
ALTER TABLE "booking_edit_requests" ADD CONSTRAINT "booking_edit_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
