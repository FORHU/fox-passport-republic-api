import { EventStatus, TransactionStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { AppError } from "../../utils/errors";
import AppointmentAccess from "../appointment/appointment.access";
import { RESERVING_TRANSACTION_STATUSES } from "../availability/availability.types";

/** Which hat the viewer wears for an entry. */
export type CalendarRole =
  "guest" | "host" | "organizer" | "venue" | "supplier";

export interface CalendarEntry {
  /** Stable across refetches: "<source>:<row id>". */
  id: string;
  /** `block` is a day the venue's owner closed themselves; only sent when
   * the caller asks for blocks. */
  kind: "event" | "asset" | "service" | "block";
  role: CalendarRole;
  title: string;
  start: Date;
  end: Date;
  status: string;
  /** Where the viewer manages or reviews it, if anywhere. */
  href: string | null;
  /** For a `venue` entry (and a block): which of the viewer's venues. */
  venueId?: string;
  venueName?: string;
  /**
   * For a `venue` entry: where the booking stands with the venue, as the
   * transaction's status. `pending_provider_confirmation` is waiting for the
   * venue to reply, `pending` is held (dates reserved, not yet confirmed or
   * paid) and `approved` is confirmed. Kept apart from `status`, which stays
   * the event's, so existing readers are unaffected.
   */
  venueStatus?: string;
}

export interface CalendarOptions {
  /** Also return the days the viewer's venues have blocked. Off by default so
   * a reader that does not know about `block` entries never sees one. */
  includeBlocks?: boolean;
}

// Long enough for a year view plus a margin; short enough that one call
// can't ask for the whole table.
const MAX_RANGE_DAYS = 400;

// When one Event reaches the viewer through several hats, the strongest wins.
const EVENT_ROLE_RANK: Record<CalendarRole, number> = {
  host: 0,
  organizer: 1,
  venue: 2,
  supplier: 3,
  guest: 4,
};

/**
 * Everything on the viewer's calendar between `from` and `to`, for every role
 * at once: events they booked (guest), run (host / organizer) or host at
 * their venue (venue), and the gear or services they rent out or supply —
 * directly or to an event (supplier). One endpoint, so a citizen, a Venue
 * Foxer and a Talent Foxer all read the same calendar shape.
 *
 * Scoping mirrors the booking list (`BookingSvc.getAllBookings`): a viewer
 * only ever sees rows they are party to.
 */
export default class CalendarSvc {
  static async forViewer(
    userId: string,
    from: Date,
    to: Date,
    options: CalendarOptions = {},
  ): Promise<CalendarEntry[]> {
    if (!(from < to)) throw new AppError("`from` must be before `to`", 400);
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      throw new AppError(`Range is limited to ${MAX_RANGE_DAYS} days`, 400);
    }

    const eventOverlap = { startAt: { lt: to }, endAt: { gt: from } };
    const notCancelledEvent = { eventStatus: { not: EventStatus.cancelled } };
    // A ServiceBooking with no endDate is a same-day booking.
    const serviceOverlap = {
      scheduledDate: { lt: to },
      OR: [
        { endDate: { gt: from } },
        { endDate: null, scheduledDate: { gte: from } },
      ],
    };
    const assetOverlap = { startDate: { lt: to }, endDate: { gt: from } };

    const [
      guestBookings,
      runEvents,
      venueEvents,
      rentedAssets,
      suppliedAssets,
      bookedServices,
      suppliedServices,
      eventServiceSupplies,
      eventAssetSupplies,
    ] = await Promise.all([
      prisma.booking.findMany({
        where: {
          userId,
          status: { not: "cancelled" },
          event: { ...eventOverlap, ...notCancelledEvent },
        },
        select: {
          id: true,
          status: true,
          event: {
            select: { id: true, name: true, startAt: true, endAt: true },
          },
        },
      }),
      prisma.event.findMany({
        where: {
          AND: [
            eventOverlap,
            notCancelledEvent,
            AppointmentAccess.eventScope(userId, "event:view-sales"),
          ],
        },
        select: {
          id: true,
          name: true,
          startAt: true,
          endAt: true,
          eventStatus: true,
          organizerId: true,
        },
      }),
      prisma.event.findMany({
        where: {
          ...eventOverlap,
          ...notCancelledEvent,
          // Every booking that holds the venue's dates: awaiting the venue's
          // reply and held pending payment as well as confirmed (the same
          // statuses availability reserves on), so the venue's owner sees a
          // request the moment it is made, not only once it is approved.
          venueTransactions: {
            some: {
              status: { in: [...RESERVING_TRANSACTION_STATUSES] },
              venue: AppointmentAccess.venueScope(
                userId,
                "venue:view-bookings",
              ),
            },
          },
        },
        select: {
          id: true,
          name: true,
          startAt: true,
          endAt: true,
          eventStatus: true,
          venueTransactions: {
            where: { status: { in: [...RESERVING_TRANSACTION_STATUSES] } },
            select: {
              status: true,
              venue: { select: { id: true, name: true } },
            },
            take: 1,
          },
        },
      }),
      prisma.assetBooking.findMany({
        where: { userId, status: { not: "cancelled" }, ...assetOverlap },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          asset: { select: { name: true } },
        },
      }),
      prisma.assetBooking.findMany({
        where: {
          asset: { ownerId: userId },
          status: { not: "cancelled" },
          ...assetOverlap,
        },
        select: {
          id: true,
          status: true,
          startDate: true,
          endDate: true,
          asset: { select: { name: true } },
        },
      }),
      prisma.serviceBooking.findMany({
        where: { userId, status: { not: "cancelled" }, ...serviceOverlap },
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          endDate: true,
          service: { select: { name: true } },
        },
      }),
      prisma.serviceBooking.findMany({
        where: {
          service: { ownerId: userId },
          status: { not: "cancelled" },
          ...serviceOverlap,
        },
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          endDate: true,
          service: { select: { name: true } },
        },
      }),
      prisma.eventServiceTransaction.findMany({
        where: {
          service: { ownerId: userId },
          status: { in: [...RESERVING_TRANSACTION_STATUSES] },
          event: { ...eventOverlap, ...notCancelledEvent },
        },
        select: {
          id: true,
          status: true,
          service: { select: { name: true } },
          event: { select: { name: true, startAt: true, endAt: true } },
        },
      }),
      prisma.eventAssetTransaction.findMany({
        where: {
          asset: { ownerId: userId },
          status: { in: [...RESERVING_TRANSACTION_STATUSES] },
          event: { ...eventOverlap, ...notCancelledEvent },
        },
        select: {
          id: true,
          status: true,
          asset: { select: { name: true } },
          event: { select: { name: true, startAt: true, endAt: true } },
        },
      }),
    ]);

    // Events, one entry per Event however many ways it reaches the viewer.
    const events = new Map<string, CalendarEntry>();
    const addEvent = (eventId: string, entry: CalendarEntry) => {
      const existing = events.get(eventId);
      if (
        !existing ||
        EVENT_ROLE_RANK[entry.role] < EVENT_ROLE_RANK[existing.role]
      ) {
        events.set(eventId, entry);
      }
    };

    for (const b of guestBookings) {
      addEvent(b.event.id, {
        id: `booking:${b.id}`,
        kind: "event",
        role: "guest",
        title: b.event.name,
        start: b.event.startAt,
        end: b.event.endAt,
        status: b.status,
        href: `/booking/${b.id}`,
      });
    }
    for (const e of runEvents) {
      const isHost = e.organizerId === userId;
      addEvent(e.id, {
        id: `event:${e.id}`,
        kind: "event",
        role: isHost ? "host" : "organizer",
        title: e.name,
        start: e.startAt,
        end: e.endAt,
        status: e.eventStatus,
        href: isHost
          ? "/creator-dashboard/events"
          : `/creator-dashboard/suppliers/${e.id}`,
      });
    }
    for (const e of venueEvents) {
      const held = e.venueTransactions[0];
      const venueName = held?.venue.name;
      addEvent(e.id, {
        id: `venue-event:${e.id}`,
        kind: "event",
        role: "venue",
        title: venueName ? `${e.name} · ${venueName}` : e.name,
        start: e.startAt,
        end: e.endAt,
        status: e.eventStatus,
        href: "/creator-dashboard/venues",
        venueId: held?.venue.id,
        venueName,
        venueStatus: held?.status,
      });
    }

    const entries: CalendarEntry[] = [...events.values()];

    if (options.includeBlocks) {
      entries.push(...(await this.blockedDays(userId, from, to)));
    }

    for (const a of rentedAssets) {
      entries.push({
        id: `asset-booking:${a.id}`,
        kind: "asset",
        role: "guest",
        title: a.asset.name,
        start: a.startDate,
        end: a.endDate,
        status: a.status,
        href: `/booking/fulfillment/asset/${a.id}`,
      });
    }
    for (const a of suppliedAssets) {
      entries.push({
        id: `asset-booking:${a.id}:owner`,
        kind: "asset",
        role: "supplier",
        title: a.asset.name,
        start: a.startDate,
        end: a.endDate,
        status: a.status,
        href: `/booking/fulfillment/asset/${a.id}`,
      });
    }
    for (const s of bookedServices) {
      entries.push({
        id: `service-booking:${s.id}`,
        kind: "service",
        role: "guest",
        title: s.service.name,
        start: s.scheduledDate,
        end: s.endDate ?? s.scheduledDate,
        status: s.status,
        href: `/booking/fulfillment/service/${s.id}`,
      });
    }
    for (const s of suppliedServices) {
      entries.push({
        id: `service-booking:${s.id}:owner`,
        kind: "service",
        role: "supplier",
        title: s.service.name,
        start: s.scheduledDate,
        end: s.endDate ?? s.scheduledDate,
        status: s.status,
        href: `/booking/fulfillment/service/${s.id}`,
      });
    }
    for (const t of eventServiceSupplies) {
      entries.push({
        id: `event-service:${t.id}`,
        kind: "service",
        role: "supplier",
        title: `${t.service.name} · ${t.event.name}`,
        start: t.event.startAt,
        end: t.event.endAt,
        status: t.status,
        href: "/foxer/marketplace-requests",
      });
    }
    for (const t of eventAssetSupplies) {
      entries.push({
        id: `event-asset:${t.id}`,
        kind: "asset",
        role: "supplier",
        title: `${t.asset.name} · ${t.event.name}`,
        start: t.event.startAt,
        end: t.event.endAt,
        status: t.status,
        href: "/foxer/marketplace-requests",
      });
    }

    return entries.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /**
   * The days between `from` and `to` that venues the viewer manages have
   * closed themselves, one entry per venue per day. The Mayor, and an
   * appointed Organizer with the calendar permission, manage a venue's
   * calendar (the same scope the venue's own availability screen uses).
   */
  private static async blockedDays(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<CalendarEntry[]> {
    const venues = await prisma.venue.findMany({
      where: {
        AND: [
          AppointmentAccess.venueScope(userId, "venue:calendar"),
          { blockedDates: { isEmpty: false } },
        ],
      },
      select: { id: true, name: true, blockedDates: true },
    });

    const DAY_MS = 24 * 60 * 60 * 1000;
    const entries: CalendarEntry[] = [];
    for (const venue of venues) {
      for (const blocked of venue.blockedDates) {
        // A blocked day is a calendar date, whatever time of day it is
        // stored at.
        const day = Date.UTC(
          blocked.getUTCFullYear(),
          blocked.getUTCMonth(),
          blocked.getUTCDate(),
        );
        if (day + DAY_MS <= from.getTime() || day >= to.getTime()) continue;
        const iso = new Date(day).toISOString().slice(0, 10);
        entries.push({
          id: `venue-block:${venue.id}:${iso}`,
          kind: "block",
          role: "venue",
          title: `Blocked · ${venue.name}`,
          start: new Date(day),
          end: new Date(day + DAY_MS),
          status: "blocked",
          href: `/creator-dashboard/venues/${venue.id}/edit`,
          venueId: venue.id,
          venueName: venue.name,
        });
      }
    }
    return entries;
  }
}
