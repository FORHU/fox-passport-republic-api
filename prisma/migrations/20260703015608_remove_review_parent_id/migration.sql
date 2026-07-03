/*
  Warnings:

  - You are about to drop the column `parentId` on the `Review` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_parentId_fkey";

-- DropIndex
DROP INDEX "Review_parentId_idx";

-- AlterTable
ALTER TABLE "Review" DROP COLUMN "parentId";
