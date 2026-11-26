-- Places: non-commercial event locations (epic #517, #518). A new table
-- only; nothing existing changes. Down: DROP TABLE "places";
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Philippines',
    "addressLine" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "places_creatorId_archivedAt_idx" ON "places"("creatorId", "archivedAt");

ALTER TABLE "places" ADD CONSTRAINT "places_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
