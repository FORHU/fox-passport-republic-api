/*
  Warnings:

  - You are about to drop the column `stripeDetailsSubmitted` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `stripedConnectedId` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "User_stripedConnectedId_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "stripeDetailsSubmitted",
DROP COLUMN "stripedConnectedId";
