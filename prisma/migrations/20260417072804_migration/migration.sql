/*
  Warnings:

  - You are about to drop the column `assetId` on the `files` table. All the data in the column will be lost.
  - You are about to drop the column `serviceId` on the `files` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `files` table. All the data in the column will be lost.
  - You are about to drop the column `venueId` on the `files` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "files" DROP CONSTRAINT "files_assetId_fkey";

-- DropForeignKey
ALTER TABLE "files" DROP CONSTRAINT "files_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "files" DROP CONSTRAINT "files_userId_fkey";

-- DropForeignKey
ALTER TABLE "files" DROP CONSTRAINT "files_venueId_fkey";

-- AlterTable
ALTER TABLE "files" DROP COLUMN "assetId",
DROP COLUMN "serviceId",
DROP COLUMN "userId",
DROP COLUMN "venueId",
ADD COLUMN     "uploadedBy" TEXT;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
