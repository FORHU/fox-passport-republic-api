-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "quality" INTEGER;
ALTER TABLE "reviews" ADD COLUMN "communication" INTEGER;
ALTER TABLE "reviews" ADD COLUMN "value" INTEGER;
ALTER TABLE "reviews" ADD COLUMN "punctuality" INTEGER;
ALTER TABLE "reviews" ADD COLUMN "helpfulCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "review_helpful_votes" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_helpful_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_helpful_votes_reviewId_userId_key" ON "review_helpful_votes"("reviewId", "userId");

-- CreateIndex
CREATE INDEX "review_helpful_votes_reviewId_idx" ON "review_helpful_votes"("reviewId");

-- CreateIndex
CREATE INDEX "review_helpful_votes_userId_idx" ON "review_helpful_votes"("userId");

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_helpful_votes" ADD CONSTRAINT "review_helpful_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed review_helpful reward rule (2 XP per vote, max 5 per day = 10 XP daily cap)
INSERT INTO "reward_rules" ("id", "action", "xp", "coins", "dailyCap", "onceOnly", "active", "updatedAt")
VALUES ('rule-review-helpful', 'review_helpful', 2, 0, 5, false, true, CURRENT_TIMESTAMP)
ON CONFLICT ("action") DO NOTHING;

