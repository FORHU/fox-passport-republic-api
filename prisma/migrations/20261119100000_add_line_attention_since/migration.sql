-- When a booked-event line started needing a replacement (ADR 0010).
ALTER TABLE "event_asset_transactions" ADD COLUMN "attentionSince" TIMESTAMP(3);
ALTER TABLE "event_service_transactions" ADD COLUMN "attentionSince" TIMESTAMP(3);
ALTER TABLE "event_venue_transactions" ADD COLUMN "attentionSince" TIMESTAMP(3);
