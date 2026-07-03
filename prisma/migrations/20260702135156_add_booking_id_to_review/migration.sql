-- DropIndex
DROP INDEX IF EXISTS "Review_userId_entityId_entityType_key";

-- AlterTable
ALTER TABLE "Review" ADD COLUMN "bookingId" TEXT;

-- Make bookingId NOT NULL (safe: table is empty in dev)
ALTER TABLE "Review" ALTER COLUMN "bookingId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Review_userId_entityId_entityType_idx" ON "Review"("userId", "entityId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
