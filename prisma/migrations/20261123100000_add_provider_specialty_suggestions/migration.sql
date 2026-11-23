-- Provider applicants can suggest a specialty the catalog lacks (api#440).
-- A new table only; no existing rows change.

-- CreateEnum
CREATE TYPE "ProviderSpecialtySuggestionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "provider_specialty_suggestions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ProviderSpecialtySuggestionStatus" NOT NULL DEFAULT 'pending',
    "suggestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_specialty_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_specialty_suggestions_status_createdAt_idx" ON "provider_specialty_suggestions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "provider_specialty_suggestions_slug_idx" ON "provider_specialty_suggestions"("slug");

-- CreateIndex
CREATE INDEX "provider_specialty_suggestions_suggestedById_idx" ON "provider_specialty_suggestions"("suggestedById");

-- AddForeignKey
ALTER TABLE "provider_specialty_suggestions" ADD CONSTRAINT "provider_specialty_suggestions_suggestedById_fkey" FOREIGN KEY ("suggestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_specialty_suggestions" ADD CONSTRAINT "provider_specialty_suggestions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_specialty_suggestions" ADD CONSTRAINT "provider_specialty_suggestions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
