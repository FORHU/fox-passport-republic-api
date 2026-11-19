-- A paid booking's edit (ADR 0010 slice 3): the price difference charged or refunded.
ALTER TABLE "event_edit_proposals" ADD COLUMN "deltaPaymentIntentId" TEXT;
ALTER TABLE "event_edit_proposals" ADD COLUMN "deltaRefundId" TEXT;
CREATE UNIQUE INDEX "event_edit_proposals_deltaPaymentIntentId_key" ON "event_edit_proposals"("deltaPaymentIntentId");
