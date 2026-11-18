-- AlterTable
ALTER TABLE "feed_posts" ADD COLUMN     "repostsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sendsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewsCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "feed_post_views" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_post_views_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateIndex
CREATE INDEX "feed_post_views_userId_idx" ON "feed_post_views"("userId");

-- AddForeignKey
ALTER TABLE "feed_post_views" ADD CONSTRAINT "feed_post_views_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_post_views" ADD CONSTRAINT "feed_post_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: sharesCount used to be bumped by reposts and message sends as
-- well as external shares. Split those out into their own counters, and
-- leave sharesCount with only what remains (event-page / external shares).
UPDATE "feed_posts" p
SET "repostsCount" = r.cnt
FROM (
    SELECT "originalPostId" AS id, COUNT(*)::int AS cnt
    FROM "feed_posts"
    WHERE "originalPostId" IS NOT NULL
    GROUP BY "originalPostId"
) r
WHERE p."id" = r.id;

UPDATE "feed_posts" p
SET "sendsCount" = m.cnt
FROM (
    SELECT "sharedPostId" AS id, COUNT(*)::int AS cnt
    FROM "messages"
    WHERE "sharedPostId" IS NOT NULL
    GROUP BY "sharedPostId"
) m
WHERE p."id" = m.id;

UPDATE "feed_posts"
SET "sharesCount" = GREATEST("sharesCount" - "repostsCount" - "sendsCount", 0)
WHERE "repostsCount" > 0 OR "sendsCount" > 0;
