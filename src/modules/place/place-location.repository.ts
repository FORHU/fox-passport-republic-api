import type { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";

/** Bookings whose guests rely on an event's location: paid, not attended. */
const CONFIRMED = { in: ["confirmed", "active"] as ("confirmed" | "active")[] };

/** Recorded location changes and acknowledgements (api#521). */
export default class PlaceLocationRepo {
  static async findEvent(eventId: string) {
    return prisma.event.findUnique({
      where: { id: String(eventId) },
      select: {
        id: true,
        name: true,
        organizerId: true,
        clientId: true,
        eventStatus: true,
        place: true,
      },
    });
  }

  /** Moves the event and records the change, in one transaction. */
  static async moveEvent(data: {
    eventId: string;
    fromPlaceId: string | null;
    toPlaceId: string;
    fromSnapshot: Prisma.InputJsonValue;
    toSnapshot: Prisma.InputJsonValue;
    reason: string;
    material: boolean;
    requestedById: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const change = await tx.eventLocationChange.create({ data });
      await tx.event.update({
        where: { id: data.eventId },
        data: { placeId: data.toPlaceId },
      });
      return change;
    });
  }

  /** The event's confirmed guests, to tell about a change. */
  static async findConfirmedGuests(eventId: string) {
    return prisma.booking.findMany({
      where: { eventId: String(eventId), status: CONFIRMED },
      select: { id: true, userId: true },
    });
  }

  static async listChanges(eventId: string) {
    return prisma.eventLocationChange.findMany({
      where: { eventId: String(eventId) },
      orderBy: { createdAt: "asc" },
      include: { acknowledgements: { select: { bookingId: true } } },
    });
  }

  static async findChange(id: string) {
    return prisma.eventLocationChange.findUnique({
      where: { id: String(id) },
      select: { id: true, eventId: true, material: true },
    });
  }

  /** The viewer's confirmed bookings on the event. */
  static async findGuestBookings(eventId: string, userId: string) {
    return prisma.booking.findMany({
      where: { eventId: String(eventId), userId, status: CONFIRMED },
      select: { id: true },
    });
  }

  /** Idempotent: acknowledging twice keeps the first time. */
  static async acknowledge(changeId: string, bookingIds: string[]) {
    await prisma.eventLocationAcknowledgement.createMany({
      data: bookingIds.map((bookingId) => ({ changeId, bookingId })),
      skipDuplicates: true,
    });
  }
}
