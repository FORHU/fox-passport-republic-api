-- mobile#498: how far a venue serves, chosen from six areas instead of a
-- drawn radius. Nullable, so existing venues keep working unchanged.
CREATE TYPE "VenueCoverage" AS ENUM ('local', 'municipal', 'city', 'province', 'national', 'international');

ALTER TABLE "venues" ADD COLUMN "coverageArea" "VenueCoverage";
