-- Applied after 20260916000000 has committed, so the new
-- 'pending_provider_confirmation' TransactionStatus value is safe to
-- reference here (both in CHECK expressions and in the partial index
-- predicates below).
--
-- Pre-check (run manually before applying, same discipline as Phase A's
-- migration-drift handling — do not apply if either query returns rows):
--
--   SELECT "bookingId", "assetId", COUNT(*) FROM "event_asset_transactions"
--   WHERE status IN ('pending_provider_confirmation','pending','approved')
--     AND "bookingId" IS NOT NULL
--   GROUP BY "bookingId", "assetId" HAVING COUNT(*) > 1;
--
--   SELECT "bookingId", "serviceId", COUNT(*) FROM "event_service_transactions"
--   WHERE status IN ('pending_provider_confirmation','pending','approved')
--     AND "bookingId" IS NOT NULL
--   GROUP BY "bookingId", "serviceId" HAVING COUNT(*) > 1;

-- Fail-closed data integrity: a row awaiting provider confirmation must
-- always carry a deadline. TransactionStatusSvc treats a null deadline on
-- such a row as a data-integrity violation, not "never expires" — this
-- constraint makes that state unreachable at the database level too.
ALTER TABLE "event_asset_transactions"
  ADD CONSTRAINT "event_asset_transactions_confirmation_deadline_chk"
  CHECK (status != 'pending_provider_confirmation' OR "confirmationDeadline" IS NOT NULL);

ALTER TABLE "event_service_transactions"
  ADD CONSTRAINT "event_service_transactions_confirmation_deadline_chk"
  CHECK (status != 'pending_provider_confirmation' OR "confirmationDeadline" IS NOT NULL);

-- Partial unique indexes: at most one ACTIVE reservation per (booking, item)
-- pair. Deliberately NOT date-range aware (see Phase B plan §6) — a booking
-- may hold only one active reservation of a given asset/service at a time,
-- not one per date sub-range. Rows with a NULL bookingId (bidding-flow
-- transactions before a booking is attached) are NOT protected by this
-- index — Postgres treats NULL as distinct in unique indexes. Real
-- overlap/quantity protection for those rows comes from
-- AvailabilitySvc.reserve's date-aware check, not this index; this index is
-- specifically the backstop for the booking-scoped ad-hoc-add endpoint,
-- where bookingId is always populated.
CREATE UNIQUE INDEX "event_asset_transactions_active_pair_uq"
  ON "event_asset_transactions" ("bookingId", "assetId")
  WHERE status IN ('pending_provider_confirmation', 'pending', 'approved');

CREATE UNIQUE INDEX "event_service_transactions_active_pair_uq"
  ON "event_service_transactions" ("bookingId", "serviceId")
  WHERE status IN ('pending_provider_confirmation', 'pending', 'approved');
