/*
  Warnings:

  - You are about to drop the column `radius` on the `venues` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "venues" DROP COLUMN "radius",
ADD COLUMN     "boundary" JSONB;
