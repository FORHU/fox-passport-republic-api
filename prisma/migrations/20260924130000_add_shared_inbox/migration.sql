-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "guestId" TEXT,
ADD COLUMN     "inboxEventId" TEXT,
ADD COLUMN     "inboxVenueId" TEXT;

-- CreateIndex
CREATE INDEX "conversations_inboxVenueId_idx" ON "conversations"("inboxVenueId");

-- CreateIndex
CREATE INDEX "conversations_inboxEventId_idx" ON "conversations"("inboxEventId");

-- CreateIndex
CREATE INDEX "conversations_guestId_idx" ON "conversations"("guestId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inboxVenueId_fkey" FOREIGN KEY ("inboxVenueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inboxEventId_fkey" FOREIGN KEY ("inboxEventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A Shared Inbox thread (CONTEXT.md) is on exactly one Venue or Event, never
-- both, and always has its guest; a thread with neither is an ordinary 1:1 or
-- group conversation and carries no guest.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inbox_shape" CHECK (
    ("inboxVenueId" IS NULL AND "inboxEventId" IS NULL AND "guestId" IS NULL)
    OR ("guestId" IS NOT NULL AND (("inboxVenueId" IS NULL) <> ("inboxEventId" IS NULL)))
);

-- One thread per guest per Venue, and per guest per Event.
CREATE UNIQUE INDEX "conversations_one_inbox_per_venue_guest" ON "conversations"("inboxVenueId", "guestId")
    WHERE "inboxVenueId" IS NOT NULL;

CREATE UNIQUE INDEX "conversations_one_inbox_per_event_guest" ON "conversations"("inboxEventId", "guestId")
    WHERE "inboxEventId" IS NOT NULL;
