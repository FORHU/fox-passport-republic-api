-- CreateEnum
CREATE TYPE "PayoutFailureReason" AS ENUM ('not_onboarded', 'stripe_error', 'source_refunded');

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "failureMessage" TEXT,
ADD COLUMN     "failureReason" "PayoutFailureReason",
ADD COLUMN     "sourceChargeId" TEXT,
ADD COLUMN     "transferAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payment_disputes" (
    "id" TEXT NOT NULL,
    "stripeDisputeId" TEXT NOT NULL,
    "stripeChargeId" TEXT NOT NULL,
    "paymentIntentId" TEXT,
    "paymentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidenceDueBy" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_disputes_stripeDisputeId_key" ON "payment_disputes"("stripeDisputeId");

-- CreateIndex
CREATE INDEX "payment_disputes_paymentId_idx" ON "payment_disputes"("paymentId");

-- CreateIndex
CREATE INDEX "payment_disputes_status_idx" ON "payment_disputes"("status");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

