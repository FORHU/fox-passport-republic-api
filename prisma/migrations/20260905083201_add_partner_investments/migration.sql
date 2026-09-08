-- CreateEnum
CREATE TYPE "InvestmentType" AS ENUM ('physical_inventory', 'financial_capital', 'venue_equity', 'event_sponsorship');

-- CreateEnum
CREATE TYPE "InventoryCategory" AS ENUM ('furniture_seating', 'tables_staging', 'audio_visual', 'lighting_rigging', 'power_climate', 'decor_props', 'other');

-- CreateEnum
CREATE TYPE "TransportPolicy" AS ENUM ('self_pickup', 'partner_delivers_free', 'partner_delivers_fee');

-- CreateTable
CREATE TABLE "partner_investments" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "InvestmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inventoryCategory" "InventoryCategory",
    "quantityTotal" INTEGER DEFAULT 1,
    "quantityAvailable" INTEGER DEFAULT 1,
    "itemCondition" TEXT,
    "monetaryValue" DECIMAL(12,2) NOT NULL,
    "usageTerms" TEXT,
    "dailyRentalRate" DECIMAL(12,2),
    "revenueSharePercent" DOUBLE PRECISION,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'Philippines',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "deliveryRadiusKm" DOUBLE PRECISION DEFAULT 25.0,
    "transportPolicy" "TransportPolicy" DEFAULT 'self_pickup',
    "targetVenueId" TEXT,
    "targetEventId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_investments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_investments_partnerId_idx" ON "partner_investments"("partnerId");

-- CreateIndex
CREATE INDEX "partner_investments_lat_lng_idx" ON "partner_investments"("lat", "lng");

-- CreateIndex
CREATE INDEX "partner_investments_type_status_idx" ON "partner_investments"("type", "status");

-- AddForeignKey
ALTER TABLE "partner_investments" ADD CONSTRAINT "partner_investments_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_investments" ADD CONSTRAINT "partner_investments_targetVenueId_fkey" FOREIGN KEY ("targetVenueId") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_investments" ADD CONSTRAINT "partner_investments_targetEventId_fkey" FOREIGN KEY ("targetEventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
