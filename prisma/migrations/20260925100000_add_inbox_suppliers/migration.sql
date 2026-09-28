-- Organizers message an Event's Suppliers through its Shared Inbox (decided
-- 25 Sep; docs/adr/0005). A thread now records who is on the other side.

-- CreateEnum
CREATE TYPE "InboxCounterpart" AS ENUM ('guest', 'supplier');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "inboxWith" "InboxCounterpart";

-- Every inbox thread so far was with a guest.
UPDATE "conversations" SET "inboxWith" = 'guest'
WHERE "inboxVenueId" IS NOT NULL OR "inboxEventId" IS NOT NULL;

-- Inbox threads always say who they are with; other threads never do.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inbox_with_shape" CHECK (
    ("guestId" IS NULL) = ("inboxWith" IS NULL)
);

-- Only an Event deals with Suppliers.
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_supplier_on_event" CHECK (
    "inboxWith" IS DISTINCT FROM 'supplier' OR "inboxEventId" IS NOT NULL
);

-- Appointments store their permission set, so Event Organizers already
-- appointed get the new one here; new ones get it from
-- EVENT_ORGANIZER_PERMISSIONS.
UPDATE "appointments"
SET "permissions" = array_append("permissions", 'event:message-suppliers')
WHERE "kind" = 'organizer'
  AND "eventId" IS NOT NULL
  AND NOT ('event:message-suppliers' = ANY("permissions"));
