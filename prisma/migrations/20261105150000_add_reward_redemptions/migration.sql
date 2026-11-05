-- AlterTable
ALTER TABLE "vouchers" ADD COLUMN "ownerUserId" TEXT;

-- CreateIndex
CREATE INDEX "vouchers_ownerUserId_idx" ON "vouchers"("ownerUserId");

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "coin_rewards" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetAudience" TEXT NOT NULL DEFAULT 'citizen',
    "coinCost" INTEGER NOT NULL,
    "rewardType" TEXT NOT NULL,
    "discountPhp" DECIMAL(12, 2),
    "discountPercentage" DECIMAL(5, 2),
    "minLevel" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_redemptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "coinsSpent" INTEGER NOT NULL,
    "voucherId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coin_redemptions_voucherId_key" ON "coin_redemptions"("voucherId");

-- CreateIndex
CREATE INDEX "coin_redemptions_userId_createdAt_idx" ON "coin_redemptions"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "coin_redemptions" ADD CONSTRAINT "coin_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_redemptions" ADD CONSTRAINT "coin_redemptions_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "coin_rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_redemptions" ADD CONSTRAINT "coin_redemptions_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default Coin Rewards catalog
INSERT INTO "coin_rewards" ("id", "title", "description", "targetAudience", "coinCost", "rewardType", "discountPhp", "discountPercentage", "minLevel", "active", "updatedAt") VALUES
('rwd-cit-20', '₱20 Booking Discount', 'Save ₱20 on any booking of ₱1,000 or more. 30-day validity.', 'citizen', 100, 'booking_voucher', 20.00, NULL, 1, true, CURRENT_TIMESTAMP),
('rwd-cit-50', '₱50 Booking Discount', 'Save ₱50 on any booking of ₱2,500 or more. 30-day validity.', 'citizen', 250, 'booking_voucher', 50.00, NULL, 3, true, CURRENT_TIMESTAMP),
('rwd-cit-100', '₱100 Booking Discount', 'Save ₱100 on any booking of ₱5,000 or more. 30-day validity.', 'citizen', 500, 'booking_voucher', 100.00, NULL, 5, true, CURRENT_TIMESTAMP),
('rwd-cit-250', '₱250 Booking Discount', 'Save ₱250 on any booking of ₱12,500 or more. 30-day validity.', 'citizen', 1250, 'booking_voucher', 250.00, NULL, 10, true, CURRENT_TIMESTAMP),
('rwd-cit-500', '₱500 Booking Discount', 'Save ₱500 on any booking of ₱25,000 or more. 30-day validity.', 'citizen', 2500, 'booking_voucher', 500.00, NULL, 15, true, CURRENT_TIMESTAMP),
('rwd-fox-boost-3', '3-Day Listing Boost', 'Highlight your listing in discovery search for 3 days.', 'foxer', 150, 'listing_boost', NULL, NULL, 3, true, CURRENT_TIMESTAMP),
('rwd-fox-boost-7', '7-Day Listing Boost', 'Highlight your listing in discovery search for 7 days.', 'foxer', 300, 'listing_boost', NULL, NULL, 5, true, CURRENT_TIMESTAMP),
('rwd-fox-fee-10', '10% Platform Fee Discount', 'Reduce platform fee by 10% on your next booking.', 'foxer', 200, 'fee_discount', NULL, 10.00, 5, true, CURRENT_TIMESTAMP),
('rwd-fox-fee-25', '25% Platform Fee Discount', 'Reduce platform fee by 25% on your next booking.', 'foxer', 450, 'fee_discount', NULL, 25.00, 10, true, CURRENT_TIMESTAMP),
('rwd-fox-fee-50', '50% Platform Fee Discount', 'Reduce platform fee by 50% on your next booking.', 'foxer', 800, 'fee_discount', NULL, 50.00, 15, true, CURRENT_TIMESTAMP);

