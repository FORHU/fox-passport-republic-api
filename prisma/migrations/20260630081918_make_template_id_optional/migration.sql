-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_templateId_fkey";

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "templateId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
