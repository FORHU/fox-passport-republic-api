import type { Place } from "@prisma/client";
import { can, type AuthorizationSubject } from "../../types/permissions";

/**
 * Who may see a Place's street address (api#519). Every response that carries
 * a Place goes through `placeForViewer`, so the rule lives in one place and the
 * apps never have to hide an address they were sent.
 *
 * Public (anyone who can see the event, pending guests, lists, cards, search,
 * stamps, profiles): name, city, province or state, country.
 * Full (street address, map pin, notes): the Place's creator, admins who
 * review packages (`queue:read`), and people taking part in an event held
 * there: a guest with a confirmed booking, the Event Owner, its Event
 * Coordinators, and Suppliers with an accepted line.
 */

/**
 * The Place columns any response may carry (plus `archivedAt`, for the
 * location rule). Queries that embed a Place in an event or package select
 * these, never the whole row, so a street address can't leak by accident.
 */
export const PUBLIC_PLACE_SELECT = {
  id: true,
  name: true,
  city: true,
  state: true,
  country: true,
  archivedAt: true,
} as const;

export interface PlaceViewer extends AuthorizationSubject {
  userId?: string | null;
}

/**
 * The viewer's part in an event held at this Place. Worked out by whoever has
 * the event (phase 2); a pending booking is not a confirmed one.
 */
export interface PlaceEventAccess {
  confirmedGuest?: boolean;
  eventOwner?: boolean;
  eventCoordinator?: boolean;
  acceptedSupplier?: boolean;
}

type PlaceRow = Pick<
  Place,
  | "id"
  | "creatorId"
  | "name"
  | "city"
  | "state"
  | "country"
  | "addressLine"
  | "lat"
  | "lng"
  | "notes"
  | "archivedAt"
>;

export interface PublicPlace {
  type: "place";
  id: string;
  name: string;
  city: string;
  state: string | null;
  country: string;
}

export interface FullPlace extends PublicPlace {
  addressLine: string;
  lat: number;
  lng: number;
  notes: string | null;
  archived: boolean;
}

export function publicPlace(place: PlaceRow): PublicPlace {
  return {
    type: "place",
    id: place.id,
    name: place.name,
    city: place.city,
    state: place.state,
    country: place.country,
  };
}

export function fullPlace(place: PlaceRow): FullPlace {
  return {
    ...publicPlace(place),
    addressLine: place.addressLine,
    lat: place.lat,
    lng: place.lng,
    notes: place.notes,
    archived: place.archivedAt !== null,
  };
}

export function canSeePlaceAddress(
  viewer: PlaceViewer | null | undefined,
  place: Pick<Place, "creatorId">,
  access: PlaceEventAccess = {},
): boolean {
  if (!viewer?.userId) return false;
  if (viewer.userId === place.creatorId) return true;
  if (can(viewer, "queue:read")) return true;
  return Boolean(
    access.confirmedGuest ||
    access.eventOwner ||
    access.eventCoordinator ||
    access.acceptedSupplier,
  );
}

export function placeForViewer(
  viewer: PlaceViewer | null | undefined,
  place: PlaceRow,
  access: PlaceEventAccess = {},
): PublicPlace | FullPlace {
  return canSeePlaceAddress(viewer, place, access)
    ? fullPlace(place)
    : publicPlace(place);
}
