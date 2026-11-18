/**
 * Where a booking's event is, for the ticket's Directions button.
 *
 * The exact spot is only shared once the booking is confirmed, so every other
 * status gets `null`. The booked venue's spot comes first (a booking on a
 * venue is held there); an event package with no venue line falls back to its
 * template's. A place with only one of the two coordinates is not a place.
 */

export type Spot = { lat: number | null; lng: number | null };

/** What the two ticket reads load alongside the booking to work this out. */
export type PlaceSource = {
  status: string;
  event: object & { template?: Spot | null };
  venueTransactions?: { venue: Spot }[];
};

const NO_SPOT: Spot = { lat: null, lng: null };

function whole(spot: Spot | null | undefined): Spot | null {
  return spot && spot.lat != null && spot.lng != null
    ? { lat: spot.lat, lng: spot.lng }
    : null;
}

export function placeOf(booking: PlaceSource): Spot {
  if (booking.status !== "confirmed") return NO_SPOT;
  return (
    whole(booking.venueTransactions?.[0]?.venue) ??
    whole(booking.event.template) ??
    NO_SPOT
  );
}

/**
 * The booking as the app reads it: the event now carries `lat` and `lng`, and
 * the helper rows used to find them are not part of the answer.
 */
export function withPlace<T extends PlaceSource>(booking: T) {
  const { venueTransactions: _venues, ...rest } = booking;
  const { template: _template, ...event } = booking.event;
  const spot = placeOf(booking);
  return { ...rest, event: { ...event, lat: spot.lat, lng: spot.lng } };
}
