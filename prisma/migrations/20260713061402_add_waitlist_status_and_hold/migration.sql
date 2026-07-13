-- AlterTable
ALTER TABLE "waitlist" ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'waiting';
