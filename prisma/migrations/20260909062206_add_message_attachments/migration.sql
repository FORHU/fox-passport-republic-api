-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "attachmentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
