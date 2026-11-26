import { VenueStatus } from "@prisma/client";
import { conflict } from "../../utils/errors";

/**
 * Every event has a location (epic #477, then #517): a Venue taking bookings
 * or a live Place. A package can't be sent for review, published or booked
 * without one. A venue is never optional, whatever its line says.
 *
 * The code stays `VENUE_REQUIRED` so the apps that already show it keep
 * working; the message names a venue or a place.
 */
export const VENUE_REQUIRED = "VENUE_REQUIRED";

/** A package or event can't have both a venue and a Place (api#520). */
export const LOCATION_CONFLICT = "LOCATION_CONFLICT";

interface VenueLine {
  id?: string;
  venueId: string | null;
  venue: { status: VenueStatus } | null;
}

/**
 * The part of a Place this rule needs: whether it is archived. A cached read
 * carries the date as a string.
 */
export interface PlaceState {
  archivedAt: Date | string | null;
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

/** Whether a Place is there and not archived. */
export const hasLivePlace = (place: PlaceState | null | undefined): boolean =>
  !!place && place.archivedAt === null;

/**
 * Whether a package has its location: a venue taking bookings (`excluded`
 * aside) or a live Place (api#520).
 */
export const hasLocation = (
  lines: readonly VenueLine[],
  place: PlaceState | null | undefined,
  excluded: readonly string[] = [],
): boolean => hasVenue(lines, excluded) || hasLivePlace(place);

export const venueRequired = (message: string) =>
  conflict(message, VENUE_REQUIRED);

export const locationConflict = (message: string) =>
  conflict(message, LOCATION_CONFLICT);
