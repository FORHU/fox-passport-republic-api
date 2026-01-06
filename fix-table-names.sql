-- Rename tables to match Prisma schema @@map() directives
-- This script renames PascalCase tables to snake_case as defined in the schema

-- Rename tables that have @@map() directives
DO $$
BEGIN
    -- Only rename if the source table exists and target doesn't
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Category') THEN
        ALTER TABLE "Category" RENAME TO "categories";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Event') THEN
        ALTER TABLE "Event" RENAME TO "events";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'EventDetails') THEN
        ALTER TABLE "EventDetails" RENAME TO "event_details";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'EventImage') THEN
        ALTER TABLE "EventImage" RENAME TO "event_images";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'EventPricing') THEN
        ALTER TABLE "EventPricing" RENAME TO "event_pricing";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'EventAvailability') THEN
        ALTER TABLE "EventAvailability" RENAME TO "event_availability";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User') THEN
        ALTER TABLE "User" RENAME TO "users";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Booking') THEN
        ALTER TABLE "Booking" RENAME TO "bookings";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'BookingAttendee') THEN
        ALTER TABLE "BookingAttendee" RENAME TO "booking_attendees";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Payment') THEN
        ALTER TABLE "Payment" RENAME TO "payments";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Review') THEN
        ALTER TABLE "Review" RENAME TO "reviews";
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Favorite') THEN
        ALTER TABLE "Favorite" RENAME TO "favorites";
    END IF;
END $$;
