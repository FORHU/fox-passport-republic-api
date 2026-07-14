/*
  Warnings:

  - You are about to drop the `Stamp` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_HostPortfolioMany` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Stamp" DROP CONSTRAINT "Stamp_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "Stamp" DROP CONSTRAINT "Stamp_templateId_fkey";

-- DropForeignKey
ALTER TABLE "Stamp" DROP CONSTRAINT "Stamp_userId_fkey";

-- DropForeignKey
ALTER TABLE "_HostPortfolioMany" DROP CONSTRAINT "_HostPortfolioMany_A_fkey";

-- DropForeignKey
ALTER TABLE "_HostPortfolioMany" DROP CONSTRAINT "_HostPortfolioMany_B_fkey";

-- AlterTable
ALTER TABLE "EventFoxerApplication" RENAME CONSTRAINT "HostApplication_pkey" TO "EventFoxerApplication_pkey";

-- AlterTable
ALTER TABLE "GearFoxerApplication" RENAME CONSTRAINT "FoxerAssetApplication_pkey" TO "GearFoxerApplication_pkey";

-- AlterTable
ALTER TABLE "ServiceFoxerApplication" RENAME CONSTRAINT "FoxerServiceApplication_pkey" TO "ServiceFoxerApplication_pkey";

-- AlterTable
ALTER TABLE "VenueFoxerApplication" RENAME CONSTRAINT "MayorApplication_pkey" TO "VenueFoxerApplication_pkey";

-- DropTable
DROP TABLE "Stamp";

-- DropTable
DROP TABLE "_HostPortfolioMany";

-- CreateTable
CREATE TABLE "_EventFoxerPortfolioMany" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventFoxerPortfolioMany_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_EventFoxerPortfolioMany_B_index" ON "_EventFoxerPortfolioMany"("B");

-- RenameForeignKey
ALTER TABLE "EventFoxerApplication" RENAME CONSTRAINT "HostApplication_birPermitFileId_fkey" TO "EventFoxerApplication_birPermitFileId_fkey";

-- RenameForeignKey
ALTER TABLE "EventFoxerApplication" RENAME CONSTRAINT "HostApplication_nbiFileId_fkey" TO "EventFoxerApplication_nbiFileId_fkey";

-- RenameForeignKey
ALTER TABLE "EventFoxerApplication" RENAME CONSTRAINT "HostApplication_portfolioFileId_fkey" TO "EventFoxerApplication_portfolioFileId_fkey";

-- RenameForeignKey
ALTER TABLE "EventFoxerApplication" RENAME CONSTRAINT "HostApplication_requestId_fkey" TO "EventFoxerApplication_requestId_fkey";

-- RenameForeignKey
ALTER TABLE "EventFoxerApplication" RENAME CONSTRAINT "HostApplication_selfieFileId_fkey" TO "EventFoxerApplication_selfieFileId_fkey";

-- RenameForeignKey
ALTER TABLE "EventFoxerApplication" RENAME CONSTRAINT "HostApplication_tinIdFileId_fkey" TO "EventFoxerApplication_tinIdFileId_fkey";

-- RenameForeignKey
ALTER TABLE "EventFoxerApplication" RENAME CONSTRAINT "HostApplication_validId1FileId_fkey" TO "EventFoxerApplication_validId1FileId_fkey";

-- RenameForeignKey
ALTER TABLE "GearFoxerApplication" RENAME CONSTRAINT "FoxerAssetApplication_birPermitFileId_fkey" TO "GearFoxerApplication_birPermitFileId_fkey";

-- RenameForeignKey
ALTER TABLE "GearFoxerApplication" RENAME CONSTRAINT "FoxerAssetApplication_nbiFileId_fkey" TO "GearFoxerApplication_nbiFileId_fkey";

-- RenameForeignKey
ALTER TABLE "GearFoxerApplication" RENAME CONSTRAINT "FoxerAssetApplication_requestId_fkey" TO "GearFoxerApplication_requestId_fkey";

-- RenameForeignKey
ALTER TABLE "GearFoxerApplication" RENAME CONSTRAINT "FoxerAssetApplication_selfieFileId_fkey" TO "GearFoxerApplication_selfieFileId_fkey";

-- RenameForeignKey
ALTER TABLE "GearFoxerApplication" RENAME CONSTRAINT "FoxerAssetApplication_tinIdFileId_fkey" TO "GearFoxerApplication_tinIdFileId_fkey";

-- RenameForeignKey
ALTER TABLE "GearFoxerApplication" RENAME CONSTRAINT "FoxerAssetApplication_validId1FileId_fkey" TO "GearFoxerApplication_validId1FileId_fkey";

-- RenameForeignKey
ALTER TABLE "ServiceFoxerApplication" RENAME CONSTRAINT "FoxerServiceApplication_birPermitFileId_fkey" TO "ServiceFoxerApplication_birPermitFileId_fkey";

-- RenameForeignKey
ALTER TABLE "ServiceFoxerApplication" RENAME CONSTRAINT "FoxerServiceApplication_nbiFileId_fkey" TO "ServiceFoxerApplication_nbiFileId_fkey";

-- RenameForeignKey
ALTER TABLE "ServiceFoxerApplication" RENAME CONSTRAINT "FoxerServiceApplication_requestId_fkey" TO "ServiceFoxerApplication_requestId_fkey";

-- RenameForeignKey
ALTER TABLE "ServiceFoxerApplication" RENAME CONSTRAINT "FoxerServiceApplication_selfieFileId_fkey" TO "ServiceFoxerApplication_selfieFileId_fkey";

-- RenameForeignKey
ALTER TABLE "ServiceFoxerApplication" RENAME CONSTRAINT "FoxerServiceApplication_tinIdFileId_fkey" TO "ServiceFoxerApplication_tinIdFileId_fkey";

-- RenameForeignKey
ALTER TABLE "ServiceFoxerApplication" RENAME CONSTRAINT "FoxerServiceApplication_validId1FileId_fkey" TO "ServiceFoxerApplication_validId1FileId_fkey";

-- RenameForeignKey
ALTER TABLE "VenueFoxerApplication" RENAME CONSTRAINT "MayorApplication_birPermitFileId_fkey" TO "VenueFoxerApplication_birPermitFileId_fkey";

-- RenameForeignKey
ALTER TABLE "VenueFoxerApplication" RENAME CONSTRAINT "MayorApplication_nbiFileId_fkey" TO "VenueFoxerApplication_nbiFileId_fkey";

-- RenameForeignKey
ALTER TABLE "VenueFoxerApplication" RENAME CONSTRAINT "MayorApplication_requestId_fkey" TO "VenueFoxerApplication_requestId_fkey";

-- RenameForeignKey
ALTER TABLE "VenueFoxerApplication" RENAME CONSTRAINT "MayorApplication_selfieFileId_fkey" TO "VenueFoxerApplication_selfieFileId_fkey";

-- RenameForeignKey
ALTER TABLE "VenueFoxerApplication" RENAME CONSTRAINT "MayorApplication_tinIdFileId_fkey" TO "VenueFoxerApplication_tinIdFileId_fkey";

-- RenameForeignKey
ALTER TABLE "VenueFoxerApplication" RENAME CONSTRAINT "MayorApplication_validId1FileId_fkey" TO "VenueFoxerApplication_validId1FileId_fkey";

-- AddForeignKey
ALTER TABLE "_EventFoxerPortfolioMany" ADD CONSTRAINT "_EventFoxerPortfolioMany_A_fkey" FOREIGN KEY ("A") REFERENCES "EventFoxerApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventFoxerPortfolioMany" ADD CONSTRAINT "_EventFoxerPortfolioMany_B_fkey" FOREIGN KEY ("B") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "HostApplication_requestId_key" RENAME TO "EventFoxerApplication_requestId_key";

-- RenameIndex
ALTER INDEX "FoxerAssetApplication_requestId_key" RENAME TO "GearFoxerApplication_requestId_key";

-- RenameIndex
ALTER INDEX "FoxerServiceApplication_requestId_key" RENAME TO "ServiceFoxerApplication_requestId_key";

-- RenameIndex
ALTER INDEX "MayorApplication_requestId_key" RENAME TO "VenueFoxerApplication_requestId_key";
