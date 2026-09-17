-- Foxer-owned promotions: a provider can create a voucher/promo code scoped
-- to their own asset or service listing, funded out of their own payout
-- instead of the platform's. Null providerId/assetId/serviceId keeps the
-- existing admin, platform-wide behavior unchanged.

ALTER TABLE "promotions"
  ADD COLUMN "providerId" TEXT,
  ADD COLUMN "assetId" TEXT,
  ADD COLUMN "serviceId" TEXT;

CREATE INDEX "promotions_providerId_idx" ON "promotions"("providerId");

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
