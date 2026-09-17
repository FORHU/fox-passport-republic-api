-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'revision_requested';

-- AlterTable
ALTER TABLE "role_requests" ADD COLUMN     "flaggedDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "revisionNote" TEXT;
