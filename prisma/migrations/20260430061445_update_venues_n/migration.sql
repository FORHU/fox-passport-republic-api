/*
  Warnings:

  - Changed the type of `category` on the `assets` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `category` on the `venues` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "assets" DROP COLUMN "category",
ADD COLUMN     "category" "AssetCategory" NOT NULL;

-- AlterTable
ALTER TABLE "venues" DROP COLUMN "category",
ADD COLUMN     "category" "VenueCategory" NOT NULL;

-- CreateIndex
CREATE INDEX "EventTemplate_targetCountry_targetCity_idx" ON "EventTemplate"("targetCountry", "targetCity");

-- CreateIndex
CREATE INDEX "assets_country_city_idx" ON "assets"("country", "city");

-- CreateIndex
CREATE INDEX "services_country_city_idx" ON "services"("country", "city");

-- CreateIndex
CREATE INDEX "venues_country_city_idx" ON "venues"("country", "city");
