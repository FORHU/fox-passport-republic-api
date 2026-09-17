-- Phase B marketplace foundation: new TransactionStatus value, ad-hoc
-- confirmation columns, request-idempotency table, itemized-refund columns.
--
-- Deliberately does NOT create the partial unique indexes that reference
-- 'pending_provider_confirmation' — Postgres refuses to use a newly added
-- enum value inside comparisons/index predicates in the same transaction
-- that added it. Those indexes live in the next migration
-- (20260916000100_phase_b_partial_unique_indexes), applied after this one
-- has committed.

-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE 'pending_provider_confirmation';

-- AlterTable: EventAssetTransaction
ALTER TABLE "event_asset_transactions"
  ADD COLUMN "confirmationDeadline" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- AlterTable: EventServiceTransaction
ALTER TABLE "event_service_transactions"
  ADD COLUMN "confirmationDeadline" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- CreateTable: RequestIdempotencyKey
CREATE TABLE "request_idempotency_keys" (
    "id"             TEXT NOT NULL,
    "endpoint"       TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requesterId"    TEXT NOT NULL,
    "bookingId"      TEXT,
    "requestHash"    TEXT NOT NULL,
    "status"         TEXT NOT NULL,
    "executionToken" TEXT NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "responseBody"   JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "request_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "request_idempotency_keys_endpoint_idempotencyKey_key"
  ON "request_idempotency_keys"("endpoint", "idempotencyKey");

-- AlterTable: Refund (itemized-refund scalars, no FK-object on the Prisma
-- side to avoid widening EventAssetTransaction/EventServiceTransaction's
-- back-relations; FK constraints are still enforced here at the DB level)
ALTER TABLE "refunds"
  ADD COLUMN "assetTransactionId" TEXT,
  ADD COLUMN "serviceTransactionId" TEXT,
  ADD COLUMN "initiatedByAdminId" TEXT;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_assetTransactionId_fkey"
    FOREIGN KEY ("assetTransactionId") REFERENCES "event_asset_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "refunds_serviceTransactionId_fkey"
    FOREIGN KEY ("serviceTransactionId") REFERENCES "event_service_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "refunds_initiatedByAdminId_fkey"
    FOREIGN KEY ("initiatedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A refund must not reference both an asset-transaction and a
-- service-transaction at once (one line item per manual refund).
-- (Does not reference the new enum value, so it's safe to create here.)
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_single_item_scope_chk"
  CHECK (NOT ("assetTransactionId" IS NOT NULL AND "serviceTransactionId" IS NOT NULL));

-- NOTE: the "confirmation deadline required" CHECK constraints reference the
-- literal 'pending_provider_confirmation' and therefore CANNOT be created in
-- this migration (Postgres forbids using a new enum value, even inside a
-- CHECK expression, in the same transaction that added it via ALTER TYPE
-- ... ADD VALUE). They are created in the next migration,
-- 20260916000100_phase_b_partial_unique_indexes, alongside the partial
-- unique indexes, which have the same restriction.
