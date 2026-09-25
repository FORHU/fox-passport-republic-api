-- An Organizer can now ask to join a Venue or Event (docs/adr/0005). Added on
-- its own: Postgres will not let a new enum value be used in the transaction
-- that adds it, and the next migration's indexes use it.
ALTER TYPE "AppointmentStatus" ADD VALUE 'requested';
