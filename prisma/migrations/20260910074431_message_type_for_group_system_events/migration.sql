-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'system');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'text';
