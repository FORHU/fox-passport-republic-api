-- Hand-written: `prisma migrate dev` requires an interactive TTY to confirm a
-- new unique constraint, which this sandbox doesn't have. Mirrors the
-- refunds generalization from the booking_edit_requests migration.

-- AlterTable: asset/service bookings gain their own discount fields, since
-- they settle outside the Invoice model these vouchers were built for.
ALTER TABLE "asset_bookings" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "voucherId" TEXT;

ALTER TABLE "service_bookings" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "voucherId" TEXT;

-- DropForeignKey
ALTER TABLE "voucher_redemptions" DROP CONSTRAINT "voucher_redemptions_invoiceId_fkey";

-- AlterTable: invoiceId becomes optional now that a redemption can instead
-- point at an assetBookingId/serviceBookingId.
ALTER TABLE "voucher_redemptions" ALTER COLUMN "invoiceId" DROP NOT NULL,
ADD COLUMN     "assetBookingId" TEXT,
ADD COLUMN     "serviceBookingId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "voucher_redemptions_assetBookingId_key" ON "voucher_redemptions"("assetBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_redemptions_serviceBookingId_key" ON "voucher_redemptions"("serviceBookingId");

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_assetBookingId_fkey" FOREIGN KEY ("assetBookingId") REFERENCES "asset_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_serviceBookingId_fkey" FOREIGN KEY ("serviceBookingId") REFERENCES "service_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
