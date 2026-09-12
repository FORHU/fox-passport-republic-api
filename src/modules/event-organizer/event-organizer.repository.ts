import { prisma } from "../../utils/prisma";
import { DelegableEventPermission } from "../../types/permissions";

export default class EventOrganizerRepo {
  static async findEvent(eventId: string) {
    return prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, organizerId: true },
    });
  }

  static async list(eventId: string) {
    return prisma.eventOrganizerAssignment.findMany({
      where: { eventId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  static async find(eventId: string, userId: string) {
    return prisma.eventOrganizerAssignment.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
  }

  static async create(data: {
    eventId: string;
    userId: string;
    assignedById: string;
    permissions?: DelegableEventPermission[];
  }) {
    return prisma.eventOrganizerAssignment.create({
      data,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  static async remove(eventId: string, userId: string) {
    return prisma.eventOrganizerAssignment.delete({
      where: { eventId_userId: { eventId, userId } },
    });
  }

  /**
   * The check every authorization site in `booking.service.ts` calls instead
   * of comparing `organizerId` directly: true for the event's own Foxer
   * (always, regardless of `permissions`) or for a delegate whose assignment
   * includes this specific permission.
   */
  static async isAuthorized(
    eventId: string | undefined | null,
    userId: string,
    permission: DelegableEventPermission,
  ): Promise<boolean> {
    if (!eventId) return false;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true },
    });
    if (!event) return false;
    if (event.organizerId === userId) return true;

    const assignment = await prisma.eventOrganizerAssignment.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { permissions: true },
    });
    return assignment?.permissions.includes(permission) ?? false;
  }
}
