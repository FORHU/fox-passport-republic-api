-- An Event Foxer can link to work hosted elsewhere, as a Provider can (app#371).
-- A constant default on Postgres 11+ rewrites no rows, so no backfill is needed.
ALTER TABLE "event_foxer_applications" ADD COLUMN "portfolioUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
