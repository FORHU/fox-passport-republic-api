import { VenueStatus } from "@prisma/client";
import { conflict } from "../../utils/errors";

/**
 * Every event has a venue (epic api#477): a package can't be sent for review,
 * published or booked without one that is taking bookings. The venue is never
 * optional, whatever its line says.
 */
export const VENUE_REQUIRED = "VENUE_REQUIRED";

interface VenueLine {
  id?: string;
  venueId: string | null;
  venue: { status: VenueStatus } | null;
}

/** Whether a package still names a venue taking bookings, `excluded` aside. */
export const hasVenue = (
  lines: readonly VenueLine[],
  excluded: readonly string[] = [],
): boolean =>
  lines.some(
    (l) =>
      l.venueId !== null &&
      l.venue?.status === VenueStatus.available &&
      !(l.id && excluded.includes(l.id)),
  );

export const venueRequired = (message: string) =>
  conflict(message, VENUE_REQUIRED);
