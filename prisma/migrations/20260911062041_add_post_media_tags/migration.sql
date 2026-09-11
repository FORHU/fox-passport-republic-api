-- CreateTable
CREATE TABLE "feed_post_media_tags" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_post_media_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feed_post_media_tags_postId_idx" ON "feed_post_media_tags"("postId");

-- CreateIndex
CREATE INDEX "feed_post_media_tags_userId_idx" ON "feed_post_media_tags"("userId");

-- AddForeignKey
ALTER TABLE "feed_post_media_tags" ADD CONSTRAINT "feed_post_media_tags_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_post_media_tags" ADD CONSTRAINT "feed_post_media_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
