-- Create MatchRequestStatus enum
CREATE TYPE "MatchRequestStatus" AS ENUM ('pending', 'accepted', 'declined', 'secured');

-- Add matchRequestStatus to event_template_assets
ALTER TABLE "event_template_assets"
  ADD COLUMN "matchRequestStatus" "MatchRequestStatus" NOT NULL DEFAULT 'pending';

-- Add matchRequestStatus to event_template_services
ALTER TABLE "event_template_services"
  ADD COLUMN "matchRequestStatus" "MatchRequestStatus" NOT NULL DEFAULT 'pending';

-- Add matchRequestStatus to event_template_venues
ALTER TABLE "event_template_venues"
  ADD COLUMN "matchRequestStatus" "MatchRequestStatus" NOT NULL DEFAULT 'pending';
