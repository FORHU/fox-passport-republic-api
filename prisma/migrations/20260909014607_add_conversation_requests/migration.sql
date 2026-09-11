/*
  Warnings:

  - Added the required column `initiatorId` to the `conversations` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('pending', 'accepted');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "initiatorId" TEXT NOT NULL,
ADD COLUMN     "status" "ConversationStatus" NOT NULL DEFAULT 'accepted';

-- CreateIndex
CREATE INDEX "conversations_userBId_status_idx" ON "conversations"("userBId", "status");

-- CreateIndex
CREATE INDEX "conversations_userAId_status_idx" ON "conversations"("userAId", "status");
