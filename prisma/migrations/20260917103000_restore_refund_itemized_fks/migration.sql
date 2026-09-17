-- Re-adds the FK constraints an auto-generated `prisma migrate dev` diff
-- dropped in 20260917102616_resolve_stash_conflicts_check. Those columns
-- (assetTransactionId/serviceTransactionId/initiatedByAdminId on "refunds")
-- are deliberately plain scalars on the Prisma schema side — see the
-- comment on Refund in prisma/schema/money.prisma and the original grant in
-- 20260916000000_phase_b_marketplace_foundation — so Prisma's schema/DB
-- diff can't see that these FKs are supposed to exist and treats them as
-- drift to remove. Restoring exactly what phase_b_marketplace_foundation
-- originally added.
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_assetTransactionId_fkey"
    FOREIGN KEY ("assetTransactionId") REFERENCES "event_asset_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "refunds_serviceTransactionId_fkey"
    FOREIGN KEY ("serviceTransactionId") REFERENCES "event_service_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "refunds_initiatedByAdminId_fkey"
    FOREIGN KEY ("initiatedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
