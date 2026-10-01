-- Optional government-ID check for citizens, reviewed by an admin. It earns a
-- "Verified" badge (users.identityVerifiedAt) and gates nothing — booking
-- still needs only a verified email.
ALTER TABLE "users" ADD COLUMN "identityVerifiedAt" TIMESTAMP(3);

CREATE TABLE "identity_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idType" TEXT NOT NULL,
    "idFileId" TEXT NOT NULL,
    "selfieFileId" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "identity_verifications_userId_createdAt_idx" ON "identity_verifications"("userId", "createdAt");
CREATE INDEX "identity_verifications_status_createdAt_idx" ON "identity_verifications"("status", "createdAt");

-- At most one submission awaiting review per person.
CREATE UNIQUE INDEX "identity_verifications_one_pending_per_user" ON "identity_verifications"("userId")
    WHERE "status" = 'pending';

ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_idFileId_fkey" FOREIGN KEY ("idFileId") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_selfieFileId_fkey" FOREIGN KEY ("selfieFileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
