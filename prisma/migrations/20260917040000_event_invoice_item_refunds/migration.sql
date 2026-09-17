-- Per-item refunds for a multi-provider Event checkout (see
-- EventCheckoutSvc.cancelEvent).
ALTER TABLE "refunds" ADD COLUMN "invoiceItemId" TEXT;

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoiceItemId_fkey"
  FOREIGN KEY ("invoiceItemId") REFERENCES "invoice_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
