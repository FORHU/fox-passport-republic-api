-- app#308: For you feed. Additive only: a new table and two indexes; no
-- existing column or row changes.

-- CreateTable
CREATE TABLE "post_resurfacings" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_resurfacings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "post_resurfacings_postId_shownAt_idx" ON "post_resurfacings"("postId", "shownAt" DESC);

-- CreateIndex
-- A plain (non-concurrent) build briefly blocks writes to feed_posts. Prisma
-- runs migrations in a transaction, where CONCURRENTLY is not allowed; the
-- table is small enough today for this to be momentary.
CREATE INDEX "feed_posts_createdAt_idx" ON "feed_posts"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "post_resurfacings" ADD CONSTRAINT "post_resurfacings_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
