-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'draft';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "currentStep" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ALTER COLUMN "numberOfTickets" DROP NOT NULL,
ALTER COLUMN "totalAmount" DROP NOT NULL,
ALTER COLUMN "bookingStatus" SET DEFAULT 'draft';

-- CreateIndex
CREATE INDEX "bookings_expiresAt_idx" ON "bookings"("expiresAt");
