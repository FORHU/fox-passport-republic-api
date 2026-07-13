-- AlterTable
--ALTER TABLE "Event" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "EventTemplate" ADD COLUMN     "maxAttendees" INTEGER;

-- CreateTable
CREATE TABLE "waitlist" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_templateId_userId_key" ON "waitlist"("templateId", "userId");

-- AddForeignKey
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
