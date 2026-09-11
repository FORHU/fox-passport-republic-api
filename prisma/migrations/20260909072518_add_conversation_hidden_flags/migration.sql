-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "hiddenForA" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hiddenForB" BOOLEAN NOT NULL DEFAULT false;
