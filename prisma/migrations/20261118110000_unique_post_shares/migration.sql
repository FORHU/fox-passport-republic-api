-- CreateTable
CREATE TABLE "feed_post_shares" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_post_shares_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateIndex
CREATE INDEX "feed_post_shares_userId_idx" ON "feed_post_shares"("userId");

-- AddForeignKey
ALTER TABLE "feed_post_shares" ADD CONSTRAINT "feed_post_shares_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_post_shares" ADD CONSTRAINT "feed_post_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: sharesCount becomes "distinct users who shared". Earlier copy-link
-- and event-page shares were anonymous (no user recorded), so they can't be
-- attributed and are dropped. The only attributable shares are successful
-- Facebook Page shares, which name their author.
INSERT INTO "feed_post_shares" ("postId", "userId", "createdAt")
SELECT "postId", "userId", MIN("createdAt")
FROM "facebook_shares"
WHERE "status" IN ('processing', 'published')
GROUP BY "postId", "userId"
ON CONFLICT DO NOTHING;

UPDATE "feed_posts" p
SET "sharesCount" = COALESCE(
    (SELECT COUNT(*)::int FROM "feed_post_shares" s WHERE s."postId" = p."id"),
    0
)
WHERE p."sharesCount" <> COALESCE(
    (SELECT COUNT(*)::int FROM "feed_post_shares" s WHERE s."postId" = p."id"),
    0
);
