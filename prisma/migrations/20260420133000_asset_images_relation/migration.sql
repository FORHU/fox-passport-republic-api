-- Move assets image linkage from assets.imgId to files.assetId.
ALTER TABLE "files" ADD COLUMN "assetId" TEXT;

UPDATE "files" AS f
SET "assetId" = a."id"
FROM "assets" AS a
WHERE a."imgId" IS NOT NULL
  AND f."id" = a."imgId";

ALTER TABLE "assets" DROP COLUMN "imgId";

CREATE INDEX "files_assetId_idx" ON "files"("assetId");

ALTER TABLE "files"
ADD CONSTRAINT "files_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "assets"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
