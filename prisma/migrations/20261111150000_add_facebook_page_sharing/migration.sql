-- Facebook Page sharing (api#320): a Foxer's connection to one Facebook Page,
-- with its tokens stored encrypted, and one row per post shared to a Page.
-- New tables only; no existing table or row is changed.

-- CreateEnum
CREATE TYPE "FacebookConnectionStatus" AS ENUM ('active', 'needs_reconnect');

-- CreateEnum
CREATE TYPE "FacebookShareStatus" AS ENUM ('publishing', 'processing', 'published', 'failed');

-- CreateTable
CREATE TABLE "facebook_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "facebookUserId" TEXT NOT NULL,
    "facebookUserName" TEXT,
    "userAccessTokenEnc" TEXT NOT NULL,
    "userTokenExpiresAt" TIMESTAMP(3),
    "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pageId" TEXT,
    "pageName" TEXT,
    "pageAccessTokenEnc" TEXT,
    "status" "FacebookConnectionStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_shares" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "status" "FacebookShareStatus" NOT NULL DEFAULT 'publishing',
    "facebookVideoId" TEXT,
    "permalinkUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facebook_connections_userId_key" ON "facebook_connections"("userId");

-- CreateIndex
CREATE INDEX "facebook_shares_userId_createdAt_idx" ON "facebook_shares"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "facebook_shares_postId_pageId_key" ON "facebook_shares"("postId", "pageId");

-- AddForeignKey
ALTER TABLE "facebook_connections" ADD CONSTRAINT "facebook_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_shares" ADD CONSTRAINT "facebook_shares_postId_fkey" FOREIGN KEY ("postId") REFERENCES "feed_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_shares" ADD CONSTRAINT "facebook_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
