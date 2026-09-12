-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('pending', 'accepted');

-- AlterTable
-- `initiatorId` is added nullable and backfilled before the NOT NULL
-- constraint is applied — the original one-step version
-- (`ADD COLUMN "initiatorId" TEXT NOT NULL`) only succeeds against an empty
-- `conversations` table, which is never true outside a brand-new database.
-- See docs/GOTCHAS.md #11. Every pre-existing row is backfilled from
-- `userAId` (falling back to `userBId`): who "initiated" a thread that
-- predates this column is cosmetic, since every such row keeps its default
-- `status` of 'accepted' and is never treated as a pending request.
ALTER TABLE "conversations" ADD COLUMN     "initiatorId" TEXT,
ADD COLUMN     "status" "ConversationStatus" NOT NULL DEFAULT 'accepted';

UPDATE "conversations" SET "initiatorId" = COALESCE("userAId", "userBId") WHERE "initiatorId" IS NULL;

ALTER TABLE "conversations" ALTER COLUMN "initiatorId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "conversations_userBId_status_idx" ON "conversations"("userBId", "status");

-- CreateIndex
CREATE INDEX "conversations_userAId_status_idx" ON "conversations"("userAId", "status");
