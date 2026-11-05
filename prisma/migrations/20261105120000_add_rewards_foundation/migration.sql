-- CreateEnum
CREATE TYPE "RewardLifecycleType" AS ENUM ('RELEASE', 'REDEMPTION', 'EXPIRY', 'REVERSAL');

-- AlterTable
ALTER TABLE "passports" ADD COLUMN "coins" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reward_rules" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "dailyCap" INTEGER,
    "onceOnly" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" "UserPath" NOT NULL,
    "action" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_lifecycles" (
    "id" TEXT NOT NULL,
    "grantEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RewardLifecycleType" NOT NULL,
    "coinsDelta" INTEGER NOT NULL,
    "reversalOf" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_lifecycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_onboardings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reward_rules_action_key" ON "reward_rules"("action");

-- CreateIndex
CREATE UNIQUE INDEX "reward_events_idempotencyKey_key" ON "reward_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "reward_events_userId_createdAt_idx" ON "reward_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "reward_events_refType_refId_idx" ON "reward_events"("refType", "refId");

-- CreateIndex
CREATE INDEX "reward_events_userId_path_idx" ON "reward_events"("userId", "path");

-- CreateIndex
CREATE INDEX "reward_events_action_createdAt_idx" ON "reward_events"("action", "createdAt");

-- CreateIndex
CREATE INDEX "reward_lifecycles_grantEventId_idx" ON "reward_lifecycles"("grantEventId");

-- CreateIndex
CREATE INDEX "reward_lifecycles_userId_type_idx" ON "reward_lifecycles"("userId", "type");

-- CreateIndex
CREATE INDEX "reward_lifecycles_reversalOf_idx" ON "reward_lifecycles"("reversalOf");

-- CreateIndex
CREATE UNIQUE INDEX "user_onboardings_userId_step_key" ON "user_onboardings"("userId", "step");

-- AddForeignKey
ALTER TABLE "reward_events" ADD CONSTRAINT "reward_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_lifecycles" ADD CONSTRAINT "reward_lifecycles_grantEventId_fkey" FOREIGN KEY ("grantEventId") REFERENCES "reward_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_lifecycles" ADD CONSTRAINT "reward_lifecycles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_onboardings" ADD CONSTRAINT "user_onboardings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default reward rules
INSERT INTO "reward_rules" ("id", "action", "xp", "coins", "dailyCap", "onceOnly", "active", "updatedAt") VALUES
('rule-book-event', 'book_event', 50, 0, NULL, false, true, CURRENT_TIMESTAMP),
('rule-attend-event', 'attend_event', 100, 40, NULL, false, true, CURRENT_TIMESTAMP),
('rule-leave-review', 'leave_review', 25, 15, NULL, false, true, CURRENT_TIMESTAMP),
('rule-five-star-review', 'five_star_review', 25, 10, NULL, false, true, CURRENT_TIMESTAMP),
('rule-share-review-post', 'share_review_post', 20, 5, NULL, false, true, CURRENT_TIMESTAMP),
('rule-post-feed', 'post_feed', 15, 3, 1, false, true, CURRENT_TIMESTAMP),
('rule-comment-feed', 'comment_feed', 3, 1, 5, false, true, CURRENT_TIMESTAMP),
('rule-like-feed', 'like_feed', 1, 0, 10, false, true, CURRENT_TIMESTAMP),
('rule-finish-intro', 'finish_intro', 50, 20, NULL, true, true, CURRENT_TIMESTAMP),
('rule-complete-profile', 'complete_profile', 30, 10, NULL, true, true, CURRENT_TIMESTAMP),
('rule-verify-identity', 'verify_identity', 100, 40, NULL, true, true, CURRENT_TIMESTAMP);

