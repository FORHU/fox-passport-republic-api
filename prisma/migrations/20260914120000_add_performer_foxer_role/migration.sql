-- Adds performerFoxer as a sixth RoleType/UserPath, for entertainment-type
-- supply (photographers, DJs, live bands, MCs) currently lumped inside
-- ServiceCategory.entertainment under serviceFoxer. Re-keyed from the
-- originally-planned `talentFoxer` to avoid colliding with serviceFoxer's
-- new public name "Talent Foxer" — see
-- fox-passport-republic-app/docs/roles-and-spaces.md and
-- fox-passport-republic-app/docs/BUSINESS-STRATEGY-MASTER.md §11.5.
--
-- Entertainment supply stays modeled as a `Service` row (no new top-level
-- catalog entity) — ownership is gated by ServiceCategory rather than
-- solely by RoleType, via PERFORMER_SERVICE_CATEGORIES in
-- src/types/permissions.ts (Phase 2, not this migration).

ALTER TYPE "RoleType" ADD VALUE 'performerFoxer';
ALTER TYPE "UserPath" ADD VALUE 'performerFoxer';

-- New granular performer categories. `entertainment` is kept — Postgres
-- can't cleanly drop an enum value — but is retired from new listings; see
-- the data migration below for existing rows.
ALTER TYPE "ServiceCategory" ADD VALUE 'photography';
ALTER TYPE "ServiceCategory" ADD VALUE 'videography';
ALTER TYPE "ServiceCategory" ADD VALUE 'dj';
ALTER TYPE "ServiceCategory" ADD VALUE 'live_band';
ALTER TYPE "ServiceCategory" ADD VALUE 'mc';

-- PerformerFoxerApplication table, mirroring service_foxer_applications.
CREATE TABLE "performer_foxer_applications" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "performerTypes" TEXT[],
    "specializations" TEXT[],
    "portfolioUrls" TEXT[],
    "experience" INTEGER NOT NULL,
    "nbiClearanceIdNumber" TEXT NOT NULL,
    "tinNumber" TEXT,
    "validId1FileId" TEXT,
    "nbiFileId" TEXT,
    "tinIdFileId" TEXT,
    "birPermitFileId" TEXT,
    "selfieFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performer_foxer_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "performer_foxer_applications_requestId_key" ON "performer_foxer_applications"("requestId");

ALTER TABLE "performer_foxer_applications" ADD CONSTRAINT "performer_foxer_applications_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "role_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performer_foxer_applications" ADD CONSTRAINT "performer_foxer_applications_validId1FileId_fkey" FOREIGN KEY ("validId1FileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performer_foxer_applications" ADD CONSTRAINT "performer_foxer_applications_nbiFileId_fkey" FOREIGN KEY ("nbiFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performer_foxer_applications" ADD CONSTRAINT "performer_foxer_applications_tinIdFileId_fkey" FOREIGN KEY ("tinIdFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performer_foxer_applications" ADD CONSTRAINT "performer_foxer_applications_birPermitFileId_fkey" FOREIGN KEY ("birPermitFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performer_foxer_applications" ADD CONSTRAINT "performer_foxer_applications_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pause existing entertainment-category Service listings. Their owners keep
-- the rows (nothing deleted) but the listings stop appearing in public
-- browse/search until reactivated by an approved performerFoxer application
-- — "reassign, require reapplication" decision, 14 Sep 2026.
UPDATE "services" SET "status" = 'paused' WHERE "category" = 'entertainment' AND "status" != 'paused';
