-- CreateEnum
CREATE TYPE "EventTemplateStatus" AS ENUM ('draft', 'pending', 'published', 'rejected', 'archived');

-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "status" "EventTemplateStatus" NOT NULL DEFAULT 'draft';
