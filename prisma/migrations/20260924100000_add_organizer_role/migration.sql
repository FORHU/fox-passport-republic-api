-- AlterEnum
ALTER TYPE "RoleType" ADD VALUE 'organizer';

-- AlterEnum
ALTER TYPE "UserPath" ADD VALUE 'organizer';

-- CreateTable
CREATE TABLE "organizer_applications" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "experience" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "specializations" TEXT[],
    "validId1FileId" TEXT,
    "backgroundClearanceFileId" TEXT,
    "selfieFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizer_applications_requestId_key" ON "organizer_applications"("requestId");

-- AddForeignKey
ALTER TABLE "organizer_applications" ADD CONSTRAINT "organizer_applications_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_applications" ADD CONSTRAINT "organizer_applications_validId1FileId_fkey" FOREIGN KEY ("validId1FileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_applications" ADD CONSTRAINT "organizer_applications_backgroundClearanceFileId_fkey" FOREIGN KEY ("backgroundClearanceFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizer_applications" ADD CONSTRAINT "organizer_applications_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
