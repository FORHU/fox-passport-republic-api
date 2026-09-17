-- Per-item discount tracking on invoice_items, so a multi-provider Event
-- checkout can attribute a Foxer-owned discount to just their own line item.
ALTER TABLE "invoice_items" ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "invoice_items" ADD COLUMN "voucherId" TEXT;

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_voucherId_fkey"
  FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- voucher_redemptions: an invoice can now carry more than one redemption
-- (one blanket + one per discounted line item), and a redemption can now
-- point at a specific invoice_item instead of only the whole invoice.
DROP INDEX IF EXISTS "voucher_redemptions_invoiceId_key";
ALTER TABLE "voucher_redemptions" ADD COLUMN "invoiceItemId" TEXT;
CREATE UNIQUE INDEX "voucher_redemptions_invoiceItemId_key" ON "voucher_redemptions"("invoiceItemId");

ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_invoiceItemId_fkey"
  FOREIGN KEY ("invoiceItemId") REFERENCES "invoice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
