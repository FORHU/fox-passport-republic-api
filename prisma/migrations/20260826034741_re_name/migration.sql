/*
  Warnings:

  - You are about to alter the column `totalAmount` on the `Booking` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `hostMarkup` on the `Booking` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `platformFee` on the `Booking` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `hostMarkupAmount` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `itemsTotal` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `platformFeeAmount` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `agreedPrice` on the `EventAssetTransaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `agreedPrice` on the `EventServiceTransaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `agreedPrice` on the `EventVenueTransaction` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `investmentRange` on the `InvestorApplication` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `hostMarkupAmount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `platformFeeAmount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `asset_bookings` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `platformFeeAmount` on the `asset_bookings` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `platformFee` on the `asset_bookings` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `price` on the `assets` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `agreedPrice` on the `event_template_assets` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `agreedPrice` on the `event_template_services` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `agreedPrice` on the `event_template_venues` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `amount` on the `payouts` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `amount` on the `refunds` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `totalAmount` on the `service_bookings` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `platformFeeAmount` on the `service_bookings` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `platformFee` on the `service_bookings` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `price` on the `services` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.
  - You are about to alter the column `price` on the `venues` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(12,2)`.

*/
-- AlterTable
ALTER TABLE "Booking" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "hostMarkup" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "platformFee" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "hostMarkupAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "itemsTotal" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "platformFeeAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "EventAssetTransaction" ALTER COLUMN "agreedPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "EventServiceTransaction" ALTER COLUMN "agreedPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "EventVenueTransaction" ALTER COLUMN "agreedPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "InvestorApplication" ALTER COLUMN "investmentRange" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "hostMarkupAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "platformFeeAmount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "asset_bookings" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "platformFeeAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "platformFee" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "assets" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "event_template_assets" ALTER COLUMN "agreedPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "event_template_services" ALTER COLUMN "agreedPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "event_template_venues" ALTER COLUMN "agreedPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "payouts" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "service_bookings" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "platformFeeAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "platformFee" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "services" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "venues" ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);
