-- Token perks (api#389): two new tables only. Nothing existing is changed, so
-- it is safe to apply before or after the code that uses it (without the
-- tables the perk routes fail; no other route reads them).

-- CreateTable
CREATE TABLE "perks" (
    "id" TEXT NOT NULL,
    "issuerType" TEXT NOT NULL,
    "issuerUserId" TEXT,
    "venueId" TEXT,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "worthPhp" DECIMAL(12,2) NOT NULL,
    "tokenCost" INTEGER NOT NULL,
    "quantity" INTEGER,
    "remaining" INTEGER,
    "validDays" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perk_redemptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "perkId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tokensSpent" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "codeSecret" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perk_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "perks_venueId_idx" ON "perks"("venueId");

-- CreateIndex
CREATE INDEX "perks_templateId_idx" ON "perks"("templateId");

-- CreateIndex
CREATE INDEX "perks_active_issuerType_idx" ON "perks"("active", "issuerType");

-- CreateIndex
CREATE UNIQUE INDEX "perk_redemptions_code_key" ON "perk_redemptions"("code");

-- CreateIndex
CREATE INDEX "perk_redemptions_userId_createdAt_idx" ON "perk_redemptions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "perk_redemptions_bookingId_idx" ON "perk_redemptions"("bookingId");

-- CreateIndex
CREATE INDEX "perk_redemptions_status_expiresAt_idx" ON "perk_redemptions"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "perk_redemptions" ADD CONSTRAINT "perk_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perk_redemptions" ADD CONSTRAINT "perk_redemptions_perkId_fkey" FOREIGN KEY ("perkId") REFERENCES "perks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
