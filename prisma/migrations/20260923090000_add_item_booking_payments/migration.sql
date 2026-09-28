ALTER TABLE "payments"
  ALTER COLUMN "invoiceId" DROP NOT NULL;

ALTER TABLE "payments"
  ADD COLUMN "assetBookingId" TEXT,
  ADD COLUMN "serviceBookingId" TEXT;

CREATE INDEX "payments_assetBookingId_idx" ON "payments"("assetBookingId");
CREATE INDEX "payments_serviceBookingId_idx" ON "payments"("serviceBookingId");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_assetBookingId_fkey"
  FOREIGN KEY ("assetBookingId") REFERENCES "asset_bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_serviceBookingId_fkey"
  FOREIGN KEY ("serviceBookingId") REFERENCES "service_bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;