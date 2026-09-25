import {
  AppointmentEndReason,
  AppointmentKind,
  AppointmentStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "../../utils/prisma";

// Invited, requested or active: each still holds the one place a person has on
// a Venue's or Event's team.
const LIVE_STATUSES = [
  AppointmentStatus.invited,
  AppointmentStatus.requested,
  AppointmentStatus.active,
];

const PERSON = { select: { id: true, name: true, email: true } } as const;

const WITH_PEOPLE = {
  user: PERSON,
  appointedBy: PERSON,
} satisfies Prisma.AppointmentInclude;

const WITH_TARGET = {
  event: {
    select: {
      id: true,
      name: true,
      startAt: true,
      endAt: true,
      eventStatus: true,
      organizerId: true,
    },
  },
  venue: { select: { id: true, name: true, city: true, mayorId: true } },
  appointedBy: PERSON,
} satisfies Prisma.AppointmentInclude;

export type AppointmentTarget =
  | { eventId: string; venueId?: undefined }
  | { venueId: string; eventId?: undefined };

export default class AppointmentRepo {
  static findEvent(eventId: string) {
    return prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        organizerId: true,
        startAt: true,
        endAt: true,
        eventStatus: true,
        acceptsOrganizerRequests: true,
      },
    });
  }

  static findVenue(venueId: string) {
    return prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        name: true,
        mayorId: true,
        acceptsOrganizerRequests: true,
      },
    });
  }

  /** Requests this Organizer has open right now — the cap counts these. */
  static countOpenRequests(userId: string, now: Date) {
    return prisma.appointment.count({
      where: {
        userId,
        status: AppointmentStatus.requested,
        expiresAt: { gt: now },
      },
    });
  }

  static setAcceptsRequests(target: AppointmentTarget, accepts: boolean) {
    return target.eventId
      ? prisma.event.update({
          where: { id: target.eventId },
          data: { acceptsOrganizerRequests: accepts },
          select: { acceptsOrganizerRequests: true },
        })
      : prisma.venue.update({
          where: { id: target.venueId! },
          data: { acceptsOrganizerRequests: accepts },
          select: { acceptsOrganizerRequests: true },
        });
  }

  /**
   * Approved Organizers an Owner might invite, by name, city or
   * specialization. What a profile card needs and nothing more — never an
   * email, which is what an Owner used to have to know to find anyone.
   */
  static searchOrganizers(filter: {
    q?: string;
    specialization?: string;
    excludeUserId: string;
    limit: number;
  }) {
    const q = filter.q?.trim();
    return prisma.user.findMany({
      where: {
        roleType: { has: "organizer" },
        id: { not: filter.excludeUserId },
        ...(q && {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        }),
        ...(filter.specialization && {
          foxerSpecializations: {
            some: { roleType: "organizer", category: filter.specialization },
          },
        }),
      },
      select: {
        id: true,
        name: true,
        imgId: true,
        city: true,
        foxerSpecializations: {
          where: { roleType: "organizer" },
          select: { category: true },
        },
        passport: {
          select: {
            paths: {
              where: { path: "organizer" },
              select: { level: true, totalXP: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
      take: filter.limit,
    });
  }

  /**
   * Venues and still-to-come Events whose owners take requests from
   * Organizers — what an Organizer can offer to help run — leaving out their
   * own and any they are already invited to, asking about, or on.
   */
  static async openToRequests(userId: string, now: Date, limit: number) {
    const notMine = {
      appointments: {
        none: { userId, status: { in: LIVE_STATUSES } },
      },
    };
    const [venues, events] = await Promise.all([
      prisma.venue.findMany({
        where: {
          acceptsOrganizerRequests: true,
          status: "available",
          mayorId: { not: userId },
          ...notMine,
        },
        select: { id: true, name: true, city: true },
        orderBy: { name: "asc" },
        take: limit,
      }),
      prisma.event.findMany({
        where: {
          acceptsOrganizerRequests: true,
          endAt: { gt: now },
          eventStatus: { notIn: ["cancelled", "completed"] },
          organizerId: { not: userId },
          ...notMine,
        },
        select: {
          id: true,
          name: true,
          startAt: true,
          endAt: true,
          targetCity: true,
        },
        orderBy: { startAt: "asc" },
        take: limit,
      }),
    ]);
    return { venues, events };
  }

  static findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, roleType: true },
    });
  }

  static findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, roleType: true },
    });
  }

  static findById(id: string) {
    return prisma.appointment.findUnique({
      where: { id },
      include: WITH_TARGET,
    });
  }

  /** The person's invited-or-active Appointment on this target, if any. */
  static findLive(target: AppointmentTarget, userId: string) {
    return prisma.appointment.findFirst({
      where: { ...target, userId, status: { in: LIVE_STATUSES } },
    });
  }

  /** Everyone ever appointed to this target, live first, newest first. */
  static listForTarget(target: AppointmentTarget) {
    return prisma.appointment.findMany({
      where: target,
      include: WITH_PEOPLE,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  static listForUser(userId: string) {
    return prisma.appointment.findMany({
      where: { userId },
      include: WITH_TARGET,
      orderBy: { createdAt: "desc" },
    });
  }

  static create(data: {
    target: AppointmentTarget;
    kind: AppointmentKind;
    status: AppointmentStatus;
    userId: string;
    appointedById: string;
    permissions: string[];
    expiresAt: Date | null;
    respondedAt: Date | null;
  }) {
    const { target, ...rest } = data;
    return prisma.appointment.create({
      data: { ...target, ...rest },
      include: WITH_PEOPLE,
    });
  }

  static respond(id: string, status: AppointmentStatus, at: Date) {
    return prisma.appointment.update({
      where: { id },
      data: { status, respondedAt: at },
      include: WITH_TARGET,
    });
  }

  /** An unanswered invitation or request that ran out of time. */
  static expire(id: string) {
    return prisma.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.declined, endedAt: new Date() },
    });
  }

  static end(
    id: string,
    reason: AppointmentEndReason,
    endedById: string,
    at: Date,
  ) {
    return prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.ended,
        endReason: reason,
        endedById,
        endedAt: at,
      },
      include: WITH_TARGET,
    });
  }

  /**
   * End every live Appointment matching `where` in one statement, returning
   * the rows first so the people affected can be told.
   */
  static async endMany(
    where: Prisma.AppointmentWhereInput,
    reason: AppointmentEndReason,
    endedById: string,
    at: Date,
  ) {
    const scope = { ...where, status: { in: LIVE_STATUSES } };
    const affected = await prisma.appointment.findMany({
      where: scope,
      include: WITH_TARGET,
    });
    if (affected.length > 0) {
      await prisma.appointment.updateMany({
        where: { id: { in: affected.map((a) => a.id) } },
        data: {
          status: AppointmentStatus.ended,
          endReason: reason,
          endedById,
          endedAt: at,
        },
      });
    }
    return affected;
  }
}
