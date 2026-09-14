-- AlterEnum
ALTER TYPE "PostType" ADD VALUE 'poll';

-- CreateTable
CREATE TABLE "feed_polls" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_poll_options" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "votesCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "feed_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_poll_votes" (
    "pollOptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_poll_votes_pkey" PRIMARY KEY ("pollOptionId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "feed_polls_postId_key" ON "feed_polls"("postId");

-- CreateIndex
CREATE INDEX "feed_poll_options_pollId_idx" ON "feed_poll_options"("pollId");

-- AddForeignKey
ALTER TABLE "feed_polls" ADD CONSTRAINT "feed_polls_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_poll_options" ADD CONSTRAINT "feed_poll_options_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "feed_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_poll_votes" ADD CONSTRAINT "feed_poll_votes_pollOptionId_fkey" FOREIGN KEY ("pollOptionId") REFERENCES "feed_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_poll_votes" ADD CONSTRAINT "feed_poll_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
