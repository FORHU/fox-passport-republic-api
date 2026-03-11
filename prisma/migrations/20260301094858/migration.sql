/*
  Warnings:

  - The values [refurbishment] on the enum `AssetCondition` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AssetCondition_new" AS ENUM ('new', 'good', 'fair', 'refurbished');
ALTER TABLE "public"."assets" ALTER COLUMN "condition" DROP DEFAULT;
ALTER TABLE "assets" ALTER COLUMN "condition" TYPE "AssetCondition_new" USING ("condition"::text::"AssetCondition_new");
ALTER TYPE "AssetCondition" RENAME TO "AssetCondition_old";
ALTER TYPE "AssetCondition_new" RENAME TO "AssetCondition";
DROP TYPE "public"."AssetCondition_old";
ALTER TABLE "assets" ALTER COLUMN "condition" SET DEFAULT 'good';
COMMIT;

-- AddForeignKey
ALTER TABLE "asset_rentals" ADD CONSTRAINT "asset_rentals_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_rentals" ADD CONSTRAINT "asset_rentals_renterId_fkey" FOREIGN KEY ("renterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
