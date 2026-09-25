-- Appointments replace event_organizer_assignments — see
-- docs/adr/0005-organizer-role-and-appointments.md. Order matters: the new
-- table is created and filled before the old one is dropped, so every existing
-- check-in delegate keeps working through the migration.

-- CreateEnum
CREATE TYPE "AppointmentKind" AS ENUM ('organizer', 'check_in_helper');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('invited', 'active', 'declined', 'ended');

-- CreateEnum
CREATE TYPE "AppointmentEndReason" AS ENUM ('removed', 'left', 'role_revoked', 'owner_role_revoked');

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "kind" "AppointmentKind" NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "eventId" TEXT,
    "venueId" TEXT,
    "userId" TEXT NOT NULL,
    "appointedById" TEXT NOT NULL,
    "permissions" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "endReason" "AppointmentEndReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    -- Every Appointment is on exactly one Event or one Venue, never both or neither.
    CONSTRAINT "appointments_exactly_one_target" CHECK (("eventId" IS NULL) <> ("venueId" IS NULL))
);

-- CreateIndex
CREATE INDEX "appointments_userId_status_idx" ON "appointments"("userId", "status");

-- CreateIndex
CREATE INDEX "appointments_eventId_status_idx" ON "appointments"("eventId", "status");

-- CreateIndex
CREATE INDEX "appointments_venueId_status_idx" ON "appointments"("venueId", "status");

-- At most one live (invited or active) Appointment per person per Event or
-- Venue. Ended and declined rows are history and may repeat, so a person can be
-- re-invited after leaving.
CREATE UNIQUE INDEX "appointments_one_live_per_event" ON "appointments"("eventId", "userId")
    WHERE "eventId" IS NOT NULL AND "status" IN ('invited', 'active');

CREATE UNIQUE INDEX "appointments_one_live_per_venue" ON "appointments"("venueId", "userId")
    WHERE "venueId" IS NOT NULL AND "status" IN ('invited', 'active');

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_appointedById_fkey" FOREIGN KEY ("appointedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Carry every existing check-in delegate over. They were any user, check-in
-- only, effective immediately — exactly a Check-in Helper. Their old per-row
-- permissions could only ever hold 'booking:check-in', so it is set directly.
INSERT INTO "appointments" ("id", "kind", "status", "eventId", "userId", "appointedById", "permissions", "respondedAt", "createdAt", "updatedAt")
SELECT "id", 'check_in_helper', 'active', "eventId", "userId", "assignedById", ARRAY['booking:check-in'], "createdAt", "createdAt", "updatedAt"
FROM "event_organizer_assignments";

-- DropForeignKey
ALTER TABLE "event_organizer_assignments" DROP CONSTRAINT "event_organizer_assignments_assignedById_fkey";

-- DropForeignKey
ALTER TABLE "event_organizer_assignments" DROP CONSTRAINT "event_organizer_assignments_eventId_fkey";

-- DropForeignKey
ALTER TABLE "event_organizer_assignments" DROP CONSTRAINT "event_organizer_assignments_userId_fkey";

-- DropTable
DROP TABLE "event_organizer_assignments";
