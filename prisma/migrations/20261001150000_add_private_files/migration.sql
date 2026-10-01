-- Identity documents move to a private bucket: no stable URL, only a storage
-- key that the API turns into a short-lived presigned link per request.
ALTER TABLE "files" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "files" ADD COLUMN "storageKey" TEXT;
