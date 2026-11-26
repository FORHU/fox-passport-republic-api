import type { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";

/** Places (api#518). */
export default class PlaceRepo {
  static async create(data: Prisma.PlaceUncheckedCreateInput) {
    return prisma.place.create({ data });
  }

  static async findById(id: string) {
    return prisma.place.findUnique({ where: { id: String(id) } });
  }

  /** The creator's own Places that aren't archived, newest first. */
  static async listByCreator(creatorId: string) {
    return prisma.place.findMany({
      where: { creatorId: String(creatorId), archivedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** An event's Place and owner, for the address rule (api#520). */
  static async findEventPlace(eventId: string) {
    return prisma.event.findUnique({
      where: { id: String(eventId) },
      select: { id: true, organizerId: true, place: true },
    });
  }

  /**
   * The viewer's part in an event, as the address rule reads it: a booking
   * that is paid (not pending, cancelled or disputed), and an accepted
   * supplier line on any kind.
   */
  static async findEventParticipation(eventId: string, userId: string) {
    const approved = {
      eventId,
      providerId: userId,
      status: "approved" as const,
    };
    const [bookings, assets, services, venues] = await Promise.all([
      prisma.booking.count({
        where: {
          eventId,
          userId,
          status: { in: ["confirmed", "active", "completed"] },
        },
      }),
      prisma.eventAssetTransaction.count({ where: approved }),
      prisma.eventServiceTransaction.count({ where: approved }),
      prisma.eventVenueTransaction.count({ where: approved }),
    ]);
    return {
      confirmedGuest: bookings > 0,
      acceptedSupplier: assets + services + venues > 0,
    };
  }

  /** How many packages and events are held at this creator's Places. */
  static async countUsesByCreator(creatorId: string) {
    const place = { creatorId: String(creatorId) };
    const [templates, events] = await Promise.all([
      prisma.eventTemplate.count({ where: { place } }),
      prisma.event.count({ where: { place } }),
    ]);
    return { templates, events };
  }

  static async update(id: string, data: Prisma.PlaceUncheckedUpdateInput) {
    return prisma.place.update({ where: { id: String(id) }, data });
  }
}
