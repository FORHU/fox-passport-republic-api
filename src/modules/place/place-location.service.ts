import type { Place } from "@prisma/client";
import { AppError, notFound } from "../../utils/errors";
import NotificationSvc from "../notifications/user-notification.service";
import PlaceRepo from "./place.repository";
import PlaceLocationRepo from "./place-location.repository";
import PlaceSvc from "./place.service";
import { canSeePlaceAddress, type PlaceViewer } from "./place-view";

/** Where a Place was, kept on a change so later edits never rewrite it. */
const snapshot = (p: Place) => ({
  placeId: p.id,
  name: p.name,
  addressLine: p.addressLine,
  city: p.city,
  state: p.state,
  country: p.country,
  lat: p.lat,
  lng: p.lng,
});

const same = (a?: string | null, b?: string | null) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** A different city, province or country is a material change. */
const isMaterial = (from: Place, to: Place) =>
  !same(from.city, to.city) ||
  !same(from.state, to.state) ||
  !same(from.country, to.country);

/**
 * Changing where an event at a Place is held, once booked (decision A10,
 * api#521). The change is recorded with where it was and where it went,
 * confirmed guests are told, and a material change asks each of them to
 * acknowledge it; their booking's own cancellation and refund terms still
 * apply. Never after the event has started.
 */
export default class PlaceLocationSvc {
  static async changeEventPlace(
    viewer: PlaceViewer,
    eventId: string,
    input: { placeId: string; reason: string },
  ) {
    const { access } = await PlaceSvc.eventAccess(viewer, eventId);
    const event = await PlaceLocationRepo.findEvent(eventId);
    if (!event) throw notFound("Event");
    if (!access.eventOwner && !access.eventCoordinator) {
      throw new AppError(
        "Only the event's owner or its coordinators can change where it is held.",
        403,
      );
    }
    if (!event.place) {
      throw new AppError(
        "This event is held at a venue; change venues through the event's supplier swap.",
        409,
        "NOT_AT_A_PLACE",
      );
    }
    if (["ongoing", "completed", "cancelled"].includes(event.eventStatus)) {
      throw new AppError(
        "This event has started or ended, so where it was held can't change.",
        409,
        "LOCATION_LOCKED",
      );
    }
    if (input.placeId === event.place.id) {
      throw new AppError("The event is already held there.", 409);
    }
    // The new Place is the requester's own, or the client's (their home).
    const to = await PlaceRepo.findById(input.placeId);
    const usable =
      to &&
      !to.archivedAt &&
      (to.creatorId === viewer.userId || to.creatorId === event.clientId);
    if (!to || !usable) throw notFound("Place");

    const material = isMaterial(event.place, to);
    const change = await PlaceLocationRepo.moveEvent({
      eventId,
      fromPlaceId: event.place.id,
      toPlaceId: to.id,
      fromSnapshot: snapshot(event.place),
      toSnapshot: snapshot(to),
      reason: input.reason,
      material,
      requestedById: viewer.userId!,
    });

    const guests = await PlaceLocationRepo.findConfirmedGuests(eventId);
    const told = new Set<string>();
    for (const g of guests) {
      if (told.has(g.userId)) continue;
      told.add(g.userId);
      await NotificationSvc.create({
        userId: g.userId,
        type: "EVENT_LOCATION_CHANGED",
        title: "Event location changed",
        message: material
          ? `"${event.name}" now takes place at ${to.name}, ${to.city}. Please confirm you've seen this; your booking's cancellation terms still apply.`
          : `"${event.name}" now takes place at ${to.name}, ${to.city}.`,
        metadata: { link: `/booking/${g.id}`, eventId, changeId: change.id },
      });
    }
    return { change, guestsNotified: told.size };
  }

  /**
   * The history, for the people who may see the address: the snapshots hold
   * it. Anyone else gets "not found".
   */
  static async listEventChanges(viewer: PlaceViewer, eventId: string) {
    const { event, access } = await PlaceSvc.eventAccess(viewer, eventId);
    if (!event?.place || !canSeePlaceAddress(viewer, event.place, access)) {
      throw notFound("Event");
    }
    return PlaceLocationRepo.listChanges(eventId);
  }

  /** A confirmed guest acknowledges a change (idempotent). */
  static async acknowledge(viewer: PlaceViewer, changeId: string) {
    const change = await PlaceLocationRepo.findChange(changeId);
    if (!change || !viewer.userId) throw notFound("Location change");
    const bookings = await PlaceLocationRepo.findGuestBookings(
      change.eventId,
      viewer.userId,
    );
    if (bookings.length === 0) throw notFound("Location change");
    await PlaceLocationRepo.acknowledge(
      change.id,
      bookings.map((b) => b.id),
    );
    return { acknowledged: true };
  }
}
