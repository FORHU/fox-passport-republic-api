-- Re-adds the FK constraints the auto-generated diff in
-- 20260922032936_venue_capacity_overage_requests dropped again, for the same
-- reason 20260917103000_restore_refund_itemized_fks already documented:
-- assetTransactionId/serviceTransactionId/initiatedByAdminId on "refunds"
-- are deliberately plain scalars on the Prisma schema side (see the comment
-- on Refund in prisma/schema/money.prisma), so any unrelated `prisma migrate
-- dev` diff can't see these FKs are supposed to exist and treats them as
-- drift to remove. Restoring exactly what that migration restored.
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_assetTransactionId_fkey"
    FOREIGN KEY ("assetTransactionId") REFERENCES "event_asset_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "refunds_serviceTransactionId_fkey"
    FOREIGN KEY ("serviceTransactionId") REFERENCES "event_service_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "refunds_initiatedByAdminId_fkey"
    FOREIGN KEY ("initiatedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
