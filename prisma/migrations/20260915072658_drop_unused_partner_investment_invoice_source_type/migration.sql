-- AlterEnum
-- Removes InvoiceSourceType.partner_investment — declared but never
-- instantiated anywhere in application code (confirmed by a full grep of
-- src/ before this migration was written), so no existing row can hold it.
BEGIN;
CREATE TYPE "InvoiceSourceType_new" AS ENUM ('booking', 'event_asset_transaction', 'event_service_transaction', 'event_venue_transaction', 'sponsorship');
ALTER TABLE "invoice_items" ALTER COLUMN "sourceType" TYPE "InvoiceSourceType_new" USING ("sourceType"::text::"InvoiceSourceType_new");
ALTER TYPE "InvoiceSourceType" RENAME TO "InvoiceSourceType_old";
ALTER TYPE "InvoiceSourceType_new" RENAME TO "InvoiceSourceType";
DROP TYPE "public"."InvoiceSourceType_old";
COMMIT;
