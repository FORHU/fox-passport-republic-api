-- AddColumn: ticketCode and checkedIn to Booking
ALTER TABLE "Booking" ADD COLUMN "ticketCode" TEXT;
ALTER TABLE "Booking" ADD COLUMN "checkedIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: unique ticketCode
CREATE UNIQUE INDEX "Booking_ticketCode_key" ON "Booking"("ticketCode");
