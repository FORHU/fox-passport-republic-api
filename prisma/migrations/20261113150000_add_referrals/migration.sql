-- RR-7 (api#302): referral codes and who referred whom. A code pays nothing by
-- itself; the payout is a later slice.

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('pending', 'rewarded', 'void');
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "referralCode" TEXT;
-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'pending',
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "referrals_referredId_key" ON "referrals"("referredId");
-- CreateIndex
CREATE INDEX "referrals_referrerId_status_idx" ON "referrals"("referrerId", "status");
-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");
-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
