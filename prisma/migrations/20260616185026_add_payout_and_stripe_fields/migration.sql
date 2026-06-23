-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'paid', 'failed');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "hostMarkupAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "itemsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "platformFeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "hostMarkupPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "asset_bookings" ADD COLUMN     "platformFeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "service_bookings" ADD COLUMN     "platformFeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "role" "RoleType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "stripeTransferId" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payouts_sourceType_sourceId_idx" ON "payouts"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "payouts_recipientId_idx" ON "payouts"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_sourceType_sourceId_recipientId_role_key" ON "payouts"("sourceType", "sourceId", "recipientId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeAccountId_key" ON "User"("stripeAccountId");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

