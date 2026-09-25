import {
  AppointmentKind,
  AppointmentStatus,
  EventStatus,
  Prisma,
  TransactionStatus,
} from "@prisma/client";
import { prisma } from "../../utils/prisma";
import {
  EVENT_ORGANIZER_PERMISSIONS,
  VENUE_ORGANIZER_PERMISSIONS,
  type AppointmentPermission,
} from "../../types/permissions";

/**
 * The one answer to "may this person do X on this Event or Venue?" — see
 * docs/adr/0005-organizer-role-and-appointments.md.
 *
 * Every call site asks here rather than comparing `Event.organizerId` or
 * `Venue.mayorId` itself. `organizerId` holds the Event *Owner*, not an
 * appointed Organizer, and a raw comparison against it silently shuts every
 * appointed Organizer out. Actions that are the Owner's alone (payouts,
 * pricing, Appointments, refunds) use `isEventOwner` / `isVenueMayor`.
 *
 * Nothing here is written back. Invitation expiry and the end of an Event
 * Appointment are worked out from the clock on every check, so no scheduled
 * job has to keep them true and a missed run cannot leave access open.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** An invitation nobody answers is dead after this long. */
export const INVITATION_TTL_MS = 14 * DAY_MS;

/** How long an Event Organizer keeps access after the Event ends — time to
 * report no-shows and answer attendees. */
export const EVENT_ORGANIZER_GRACE_MS = 7 * DAY_MS;

/**
 * Venue staff may check in a guest of someone else's Event only "on the
 * Event's day". Calendar days depend on a time zone nothing here knows, so
 * the day is the Event's own window, widened by this much either side for
 * doors opening early and guests arriving late.
 */
export const VENUE_CHECK_IN_MARGIN_MS = 6 * HOUR_MS;

interface AppointmentLike {
  kind: AppointmentKind;
  status: AppointmentStatus;
  expiresAt: Date | null;
  permissions: string[];
}

interface EventWindow {
  startAt: Date;
  endAt: Date;
  eventStatus: EventStatus;
}

/** An invitation, or an Organizer's request, that can still be answered. */
export function isInvitationOpen(
  appointment: Pick<AppointmentLike, "status" | "expiresAt">,
  now: Date,
): boolean {
  return (
    (appointment.status === AppointmentStatus.invited ||
      appointment.status === AppointmentStatus.requested) &&
    appointment.expiresAt !== null &&
    appointment.expiresAt.getTime() > now.getTime()
  );
}

/**
 * Whether an Appointment currently grants anything. A Venue Appointment is
 * live while it is `active`. An Event Appointment also stops with its Event:
 * at once if the Event is cancelled; for a Check-in Helper when the Event
 * ends; for an Organizer seven days after.
 */
export function isAppointmentLive(
  appointment: Pick<AppointmentLike, "kind" | "status">,
  event: EventWindow | null,
  now: Date,
): boolean {
  if (appointment.status !== AppointmentStatus.active) return false;
  if (!event) return true;
  if (event.eventStatus === EventStatus.cancelled) return false;
  const lastsUntil =
    appointment.kind === AppointmentKind.organizer
      ? event.endAt.getTime() + EVENT_ORGANIZER_GRACE_MS
      : event.endAt.getTime();
  return now.getTime() < lastsUntil;
}

/** Whether `now` falls on the Event's day, for venue-side check-in. */
export function isWithinEventDay(event: EventWindow, now: Date): boolean {
  if (event.eventStatus === EventStatus.cancelled) return false;
  const t = now.getTime();
  return (
    t >= event.startAt.getTime() - VENUE_CHECK_IN_MARGIN_MS &&
    t <= event.endAt.getTime() + VENUE_CHECK_IN_MARGIN_MS
  );
}

export function isEventOwner(
  event: { organizerId: string } | null | undefined,
  userId: string,
): boolean {
  return !!event && event.organizerId === userId;
}

export function isVenueMayor(
  venue: { mayorId: string } | null | undefined,
  userId: string,
): boolean {
  return !!venue && venue.mayorId === userId;
}

export default class AppointmentAccess {
  /**
   * May `userId` do `permission` on this Event? True for its Owner (every
   * permission), for anyone whose live Appointment on the Event includes it,
   * and — for `booking:check-in` only — for the Mayor or live staff of a
   * Venue the Event is held at, during the Event's day.
   */
  static async canOnEvent(
    eventId: string | null | undefined,
    userId: string,
    permission: AppointmentPermission,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!eventId) return false;
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        organizerId: true,
        startAt: true,
        endAt: true,
        eventStatus: true,
      },
    });
    if (!event) return false;
    if (isEventOwner(event, userId)) return true;

    const appointment = await prisma.appointment.findFirst({
      where: { eventId, userId, status: AppointmentStatus.active },
      select: { kind: true, status: true, permissions: true },
    });
    if (
      appointment &&
      appointment.permissions.includes(permission) &&
      isAppointmentLive(appointment, event, now)
    ) {
      return true;
    }

    if (permission !== "booking:check-in" || !isWithinEventDay(event, now)) {
      return false;
    }
    return AppointmentAccess.isStaffOfEventVenue(eventId, userId);
  }

  /**
   * May `userId` do `permission` on this Venue? True for its Mayor (every
   * permission) and for anyone whose active Appointment on it includes it.
   */
  static async canOnVenue(
    venueId: string | null | undefined,
    userId: string,
    permission: AppointmentPermission,
  ): Promise<boolean> {
    if (!venueId) return false;
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { mayorId: true },
    });
    if (!venue) return false;
    if (isVenueMayor(venue, userId)) return true;

    const appointment = await prisma.appointment.findFirst({
      where: { venueId, userId, status: AppointmentStatus.active },
      select: { permissions: true },
    });
    return appointment?.permissions.includes(permission) ?? false;
  }

  /**
   * What `userId` is on this Event or Venue, and what that lets them do — so a
   * page can show the Owner's controls, an Organizer's, or none. The same
   * rules as `canOnEvent`/`canOnVenue`; only the answers the page needs. An
   * Owner is listed with the whole Organizer set, since they hold all of it
   * and more.
   */
  static async describe(
    target: { eventId: string } | { venueId: string },
    userId: string,
    now: Date = new Date(),
  ): Promise<{
    role: "owner" | "organizer" | "check_in_helper" | null;
    permissions: string[];
  }> {
    const none = { role: null, permissions: [] };
    if ("eventId" in target) {
      const event = await prisma.event.findUnique({
        where: { id: target.eventId },
        select: {
          organizerId: true,
          startAt: true,
          endAt: true,
          eventStatus: true,
        },
      });
      if (!event) return none;
      if (isEventOwner(event, userId)) {
        return { role: "owner", permissions: [...EVENT_ORGANIZER_PERMISSIONS] };
      }
      const appointment = await prisma.appointment.findFirst({
        where: {
          eventId: target.eventId,
          userId,
          status: AppointmentStatus.active,
        },
        select: { kind: true, status: true, permissions: true },
      });
      return appointment && isAppointmentLive(appointment, event, now)
        ? { role: appointment.kind, permissions: appointment.permissions }
        : none;
    }

    const venue = await prisma.venue.findUnique({
      where: { id: target.venueId },
      select: { mayorId: true },
    });
    if (!venue) return none;
    if (isVenueMayor(venue, userId)) {
      return { role: "owner", permissions: [...VENUE_ORGANIZER_PERMISSIONS] };
    }
    const appointment = await prisma.appointment.findFirst({
      where: {
        venueId: target.venueId,
        userId,
        status: AppointmentStatus.active,
      },
      select: { kind: true, permissions: true },
    });
    return appointment
      ? { role: appointment.kind, permissions: appointment.permissions }
      : none;
  }

  /**
   * Everyone who may do `permission` on this Event or Venue right now — its
   * Owner or Mayor first, then every live Appointment holding it. The same
   * rules as `canOnEvent`/`canOnVenue`, as a list: who a Shared Inbox thread
   * should reach. Leaves out venue-side check-in, which is the only rule
   * that reaches across from a Venue to an Event.
   */
  static async staffIds(
    target: { eventId: string } | { venueId: string },
    permission: AppointmentPermission,
    now: Date = new Date(),
  ): Promise<string[]> {
    if ("eventId" in target) {
      const event = await prisma.event.findUnique({
        where: { id: target.eventId },
        select: {
          organizerId: true,
          startAt: true,
          endAt: true,
          eventStatus: true,
        },
      });
      if (!event) return [];
      const rows = await prisma.appointment.findMany({
        where: {
          eventId: target.eventId,
          status: AppointmentStatus.active,
          permissions: { has: permission },
        },
        select: { userId: true, kind: true, status: true },
      });
      const live = rows
        .filter((a) => isAppointmentLive(a, event, now))
        .map((a) => a.userId);
      return [...new Set([event.organizerId, ...live])];
    }

    const venue = await prisma.venue.findUnique({
      where: { id: target.venueId },
      select: { mayorId: true },
    });
    if (!venue) return [];
    const rows = await prisma.appointment.findMany({
      where: {
        venueId: target.venueId,
        status: AppointmentStatus.active,
        permissions: { has: permission },
      },
      select: { userId: true },
    });
    return [...new Set([venue.mayorId, ...rows.map((a) => a.userId)])];
  }

  /**
   * The same rule as `canOnEvent`, as a filter: every Event `userId` may do
   * `permission` on, for lists that must show exactly those and no more. Uses
   * the Organizer's seven-day grace — the only kind whose set holds anything
   * a list would ask about beyond check-in.
   */
  static eventScope(
    userId: string,
    permission: AppointmentPermission,
    now: Date = new Date(),
  ): Prisma.EventWhereInput {
    return {
      OR: [
        { organizerId: userId },
        {
          eventStatus: { not: EventStatus.cancelled },
          endAt: { gt: new Date(now.getTime() - EVENT_ORGANIZER_GRACE_MS) },
          appointments: {
            some: {
              userId,
              kind: AppointmentKind.organizer,
              status: AppointmentStatus.active,
              permissions: { has: permission },
            },
          },
        },
      ],
    };
  }

  /** Every Venue `userId` may do `permission` on, as a filter. */
  static venueScope(
    userId: string,
    permission: AppointmentPermission,
  ): Prisma.VenueWhereInput {
    return {
      OR: [
        { mayorId: userId },
        {
          appointments: {
            some: {
              userId,
              status: AppointmentStatus.active,
              permissions: { has: permission },
            },
          },
        },
      ],
    };
  }

  /**
   * Mayor or check-in-capable staff of a Venue this Event is actually held
   * at. Choosing the Venue is the Event Owner's consent to its staff running
   * the door (ADR 0005), so only an approved venue booking counts.
   */
  private static async isStaffOfEventVenue(
    eventId: string,
    userId: string,
  ): Promise<boolean> {
    const match = await prisma.eventVenueTransaction.findFirst({
      where: {
        eventId,
        status: TransactionStatus.approved,
        OR: [
          { venue: { mayorId: userId } },
          {
            venue: {
              appointments: {
                some: {
                  userId,
                  status: AppointmentStatus.active,
                  permissions: { has: "booking:check-in" },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    return match !== null;
  }
}
