import { AppError, notFound } from "../../utils/errors";
import { isPhAddress, isPhilippines } from "../locations/ph-geo";
import PlaceRepo from "./place.repository";
import { canSeePlaceAddress, fullPlace, type PlaceViewer } from "./place-view";

export interface PlaceInput {
  name: string;
  addressLine: string;
  city: string;
  state?: string | null;
  country?: string;
  lat: number;
  lng: number;
  notes?: string | null;
}

const blankToNull = (v?: string | null) => (v?.trim() ? v.trim() : null);

/**
 * A Philippine address must name a real city in a real province, the same
 * check the venue builder makes. Elsewhere the text is taken as given.
 */
function checkAddress(p: {
  city: string;
  state: string | null;
  country: string;
}) {
  if (isPhilippines(p.country) && !isPhAddress(p.state ?? undefined, p.city)) {
    throw new AppError(
      "Pick the province and a city in it from the list.",
      400,
      "PLACE_ADDRESS",
    );
  }
}

/**
 * Places: non-commercial event locations (epic #517, api#518). Any signed-in
 * account may make one: every account is a Citizen, and Provider Foxers make
 * them for their packages. A Place is private to its creator; events held
 * there show it to others through `placeForViewer` (api#519).
 */
export default class PlaceSvc {
  static async create(creatorId: string, input: PlaceInput) {
    const data = {
      name: input.name.trim(),
      addressLine: input.addressLine.trim(),
      city: input.city.trim(),
      state: blankToNull(input.state),
      country: input.country?.trim() || "Philippines",
      lat: input.lat,
      lng: input.lng,
      notes: blankToNull(input.notes),
    };
    checkAddress(data);
    return fullPlace(await PlaceRepo.create({ ...data, creatorId }));
  }

  static async listMine(creatorId: string) {
    return (await PlaceRepo.listByCreator(creatorId)).map(fullPlace);
  }

  /**
   * One Place, for its creator or an admin. Anyone else gets "not found":
   * outside an event a Place is private, so there is nothing public to show.
   */
  static async get(viewer: PlaceViewer, id: string) {
    const place = await PlaceRepo.findById(id);
    if (!place || !canSeePlaceAddress(viewer, place)) throw notFound("Place");
    return fullPlace(place);
  }

  /** Only the creator edits, and never an archived Place. */
  private static async ownLive(creatorId: string, id: string) {
    const place = await PlaceRepo.findById(id);
    if (!place || place.creatorId !== creatorId) throw notFound("Place");
    if (place.archivedAt) {
      throw new AppError("This place is archived.", 409, "PLACE_ARCHIVED");
    }
    return place;
  }

  static async update(
    creatorId: string,
    id: string,
    patch: Partial<PlaceInput>,
  ) {
    const place = await this.ownLive(creatorId, id);
    const next = {
      name: patch.name?.trim() ?? place.name,
      addressLine: patch.addressLine?.trim() ?? place.addressLine,
      city: patch.city?.trim() ?? place.city,
      state: patch.state === undefined ? place.state : blankToNull(patch.state),
      country:
        patch.country === undefined
          ? place.country
          : patch.country.trim() || "Philippines",
      lat: patch.lat ?? place.lat,
      lng: patch.lng ?? place.lng,
      notes: patch.notes === undefined ? place.notes : blankToNull(patch.notes),
    };
    checkAddress(next);
    return fullPlace(await PlaceRepo.update(id, next));
  }

  /** Archived, never deleted: events that used it keep it. */
  static async archive(creatorId: string, id: string) {
    const place = await PlaceRepo.findById(id);
    if (!place || place.creatorId !== creatorId) throw notFound("Place");
    if (place.archivedAt) return fullPlace(place);
    return fullPlace(await PlaceRepo.update(id, { archivedAt: new Date() }));
  }
}
