-- AddColumn specializations to all four application tables
ALTER TABLE "EventFoxerApplication" ADD COLUMN IF NOT EXISTS "specializations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "GearFoxerApplication" ADD COLUMN IF NOT EXISTS "specializations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ServiceFoxerApplication" ADD COLUMN IF NOT EXISTS "specializations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "VenueFoxerApplication" ADD COLUMN IF NOT EXISTS "specializations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable FoxerSpecialization
CREATE TABLE IF NOT EXISTS "FoxerSpecialization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleType" "RoleType" NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoxerSpecialization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FoxerSpecialization_roleType_category_idx" ON "FoxerSpecialization"("roleType", "category");

-- CreateUniqueIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FoxerSpecialization_userId_roleType_category_key" ON "FoxerSpecialization"("userId", "roleType", "category");

-- AddForeignKey
ALTER TABLE "FoxerSpecialization" ADD CONSTRAINT "FoxerSpecialization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
