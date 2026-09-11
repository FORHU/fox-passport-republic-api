-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "sharedPostId" TEXT;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sharedPostId_fkey" FOREIGN KEY ("sharedPostId") REFERENCES "feed_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
