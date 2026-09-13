-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "PartnershipType" AS ENUM ('investment', 'sponsorship', 'resource_contribution', 'business_partnership');

-- CreateEnum
CREATE TYPE "PartnershipProposalStatus" AS ENUM ('pending', 'accepted', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "InvoiceSourceType" AS ENUM ('booking', 'event_asset_transaction', 'event_service_transaction', 'event_venue_transaction', 'partner_investment', 'sponsorship');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('active', 'completed', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "PayoutSourceType" AS ENUM ('event_asset_transaction', 'event_service_transaction', 'event_venue_transaction', 'event_host_markup', 'sponsorship');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('pending', 'processing', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded');
ALTER TABLE "public"."asset_bookings" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "public"."service_bookings" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "service_bookings" ALTER COLUMN "paymentStatus" TYPE "PaymentStatus_new" USING ("paymentStatus"::text::"PaymentStatus_new");
ALTER TABLE "asset_bookings" ALTER COLUMN "paymentStatus" TYPE "PaymentStatus_new" USING ("paymentStatus"::text::"PaymentStatus_new");
ALTER TABLE "payments" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING ("status"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "asset_bookings" ALTER COLUMN "paymentStatus" SET DEFAULT 'pending';
ALTER TABLE "service_bookings" ALTER COLUMN "paymentStatus" SET DEFAULT 'pending';
COMMIT;

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_paymentId_fkey";

-- DropIndex
DROP INDEX "payments_transactionId_key";

-- DropIndex
DROP INDEX "payouts_recipientId_idx";

-- DropIndex
DROP INDEX "payouts_sourceType_sourceId_idx";

-- DropIndex
DROP INDEX "payouts_sourceType_sourceId_recipientId_role_key";

-- DropIndex
DROP INDEX "refunds_bookingId_idx";

-- DropIndex
DROP INDEX "refunds_status_idx";

-- DropIndex
DROP INDEX "refunds_stripeRefundId_key";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "bookingId",
DROP COLUMN "currency",
DROP COLUMN "expiresAt",
DROP COLUMN "hostMarkupAmount",
DROP COLUMN "paymentType",
DROP COLUMN "platformFeeAmount",
DROP COLUMN "transactionId",
ADD COLUMN     "invoiceId" TEXT NOT NULL,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'stripe',
ADD COLUMN     "providerReference" TEXT,
ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "payouts" DROP COLUMN "amount",
DROP COLUMN "currency",
DROP COLUMN "failureReason",
DROP COLUMN "recipientId",
DROP COLUMN "role",
DROP COLUMN "stripeTransferId",
ADD COLUMN     "allocationAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "gatewayFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "payoutAmount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "platformFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "providerId" TEXT NOT NULL,
ADD COLUMN     "providerReference" TEXT,
DROP COLUMN "sourceType",
ADD COLUMN     "sourceType" "PayoutSourceType" NOT NULL;

-- AlterTable
ALTER TABLE "refunds" DROP COLUMN "adminNotes",
DROP COLUMN "currency",
DROP COLUMN "failureCode",
DROP COLUMN "failureReason",
DROP COLUMN "initiatedBy",
DROP COLUMN "resolved",
DROP COLUMN "resolvedAt",
DROP COLUMN "resolvedBy",
DROP COLUMN "stripeRefundId",
ADD COLUMN     "providerReference" TEXT,
ADD COLUMN     "reason" TEXT,
ALTER COLUMN "bookingId" DROP NOT NULL,
ALTER COLUMN "paymentId" SET NOT NULL;

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "accessibilityInformation" TEXT,
ADD COLUMN     "blockedDates" TIMESTAMP(3)[],
ADD COLUMN     "depositRequirements" TEXT,
ADD COLUMN     "entranceInstructions" TEXT,
ADD COLUMN     "facilities" TEXT[],
ADD COLUMN     "floorPlanUrls" TEXT[],
ADD COLUMN     "minBookingTime" INTEGER,
ADD COLUMN     "operatingHours" JSONB,
ADD COLUMN     "parkingInformation" TEXT,
ADD COLUMN     "recommendedCapacity" INTEGER,
ADD COLUMN     "seatingArrangements" TEXT[],
ADD COLUMN     "seatingLayoutUrls" TEXT[],
ADD COLUMN     "setupOptions" TEXT[],
ADD COLUMN     "stageConfig" TEXT;

-- DropTable
DROP TABLE "stripe_events";

-- DropEnum
DROP TYPE "PaymentType";

-- CreateTable
CREATE TABLE "venue_packages" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "durationHours" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "includedItems" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_service_bids" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventTemplateServiceId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "proposedServiceId" TEXT NOT NULL,
    "message" TEXT,
    "proposedPrice" DECIMAL(12,2) NOT NULL,
    "status" "BidStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_service_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_asset_bids" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventTemplateAssetId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "proposedAssetId" TEXT NOT NULL,
    "message" TEXT,
    "proposedPrice" DECIMAL(12,2) NOT NULL,
    "proposedQuantity" INTEGER NOT NULL DEFAULT 1,
    "status" "BidStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_asset_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "partnershipInterests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contributionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnership_proposals" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "targetEventId" TEXT,
    "targetVenueId" TEXT,
    "partnershipType" "PartnershipType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proposedAmount" DECIMAL(12,2),
    "proposedContribution" TEXT,
    "proposedBenefits" TEXT,
    "status" "PartnershipProposalStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partnership_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_fee_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transactionType" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "percentage" DECIMAL(5,2),
    "fixedAmount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_fee_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "transactionType" TEXT,
    "category" TEXT,
    "subcategory" TEXT,
    "discountType" TEXT NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "minSubtotal" DECIMAL(12,2),
    "maxDiscount" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_redemptions" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "subtotalAmount" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountSnapshot" JSONB,
    "discountedSubtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformFeeSnapshot" JSONB,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" "InvoiceSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkouts" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSessionId" TEXT,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_VenueRecommendedAssets" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_VenueRecommendedAssets_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_VenueRecommendedServices" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_VenueRecommendedServices_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_profiles_userId_key" ON "partner_profiles"("userId");

-- CreateIndex
CREATE INDEX "partnership_proposals_partnerId_idx" ON "partnership_proposals"("partnerId");

-- CreateIndex
CREATE INDEX "partnership_proposals_targetEventId_idx" ON "partnership_proposals"("targetEventId");

-- CreateIndex
CREATE INDEX "partnership_proposals_targetVenueId_idx" ON "partnership_proposals"("targetVenueId");

-- CreateIndex
CREATE INDEX "platform_fee_configs_transactionType_idx" ON "platform_fee_configs"("transactionType");

-- CreateIndex
CREATE INDEX "platform_fee_configs_category_idx" ON "platform_fee_configs"("category");

-- CreateIndex
CREATE INDEX "platform_fee_configs_active_idx" ON "platform_fee_configs"("active");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_code_key" ON "vouchers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "voucher_redemptions_invoiceId_key" ON "voucher_redemptions"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_providerSessionId_key" ON "checkouts"("providerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_events_provider_providerEventId_key" ON "payment_provider_events"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "_VenueRecommendedAssets_B_index" ON "_VenueRecommendedAssets"("B");

-- CreateIndex
CREATE INDEX "_VenueRecommendedServices_B_index" ON "_VenueRecommendedServices"("B");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerReference_key" ON "payments"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_sourceType_sourceId_providerId_key" ON "payouts"("sourceType", "sourceId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_providerReference_key" ON "refunds"("providerReference");

-- AddForeignKey
ALTER TABLE "venue_packages" ADD CONSTRAINT "venue_packages_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_service_bids" ADD CONSTRAINT "event_service_bids_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_service_bids" ADD CONSTRAINT "event_service_bids_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_service_bids" ADD CONSTRAINT "event_service_bids_proposedServiceId_fkey" FOREIGN KEY ("proposedServiceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_service_bids" ADD CONSTRAINT "event_service_bids_eventTemplateServiceId_fkey" FOREIGN KEY ("eventTemplateServiceId") REFERENCES "event_template_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_asset_bids" ADD CONSTRAINT "event_asset_bids_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_asset_bids" ADD CONSTRAINT "event_asset_bids_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_asset_bids" ADD CONSTRAINT "event_asset_bids_proposedAssetId_fkey" FOREIGN KEY ("proposedAssetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_asset_bids" ADD CONSTRAINT "event_asset_bids_eventTemplateAssetId_fkey" FOREIGN KEY ("eventTemplateAssetId") REFERENCES "event_template_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_proposals" ADD CONSTRAINT "partnership_proposals_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_proposals" ADD CONSTRAINT "partnership_proposals_targetEventId_fkey" FOREIGN KEY ("targetEventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_proposals" ADD CONSTRAINT "partnership_proposals_targetVenueId_fkey" FOREIGN KEY ("targetVenueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VenueRecommendedAssets" ADD CONSTRAINT "_VenueRecommendedAssets_A_fkey" FOREIGN KEY ("A") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VenueRecommendedAssets" ADD CONSTRAINT "_VenueRecommendedAssets_B_fkey" FOREIGN KEY ("B") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VenueRecommendedServices" ADD CONSTRAINT "_VenueRecommendedServices_A_fkey" FOREIGN KEY ("A") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_VenueRecommendedServices" ADD CONSTRAINT "_VenueRecommendedServices_B_fkey" FOREIGN KEY ("B") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

