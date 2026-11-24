-- api#455: one favourite per user and item.
--
-- Adding used to be find-then-create, so a double click or two devices saving
-- at once could store the same favourite twice. Keep the oldest copy of each
-- (user, type, item) and drop the rest - every deleted row is an exact
-- duplicate of one that stays - then enforce it with a unique index.

DELETE FROM "favorites" a
USING "favorites" b
WHERE a."userId" = b."userId"
  AND a."entityType" = b."entityType"
  AND a."entityId" = b."entityId"
  AND (a."createdAt" > b."createdAt"
       OR (a."createdAt" = b."createdAt" AND a."id" > b."id"));

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_entityType_entityId_key" ON "favorites"("userId", "entityType", "entityId");
