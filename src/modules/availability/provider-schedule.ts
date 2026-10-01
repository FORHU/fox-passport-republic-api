import { prisma, AppTransactionClient } from "../../utils/prisma";
import {
  AvailabilityCheckItem,
  RESERVING_TRANSACTION_STATUSES,
} from "./availability.types";

/**
 * A talent or performer Foxer is one person, however many services they
 * list: booked anywhere on a day means unavailable for every other booking
 * that day. And travelling between cities takes time, so the day before and
 * the day after a booking are blocked too — unless the new booking is in the
 * same city.
 *
 * The per-service check in `AvailabilitySvc.lockAndCheckService` only ever
 * compared a service with itself, so a DJ who also lists MC work could be
 * booked for both on one night, and neither calendar showed the other.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a booking happens, as far as the data says. */
export interface Place {
  /** Structured — an Event's `targetCity`, or its venue's city. */
  city?: string | null;
  /** Free text — a direct booking's `location`. */
  text?: string | null;
}

export interface ProviderEngagement {
  start: Date;
  end: Date;
  eventId: string | null;
  place: Place;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bcity of\b|\bcity\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function segments(text: string): string[] {
  return text
    .split(",")
    .map(normalize)
    .filter((s) => s.length > 0 && !/^\d+$/.test(s));
}

/**
 * Best-effort "same city?" across structured cities and free-text addresses.
 * Free text is compared segment by segment ("12 Ayala Ave, Makati, Metro
 * Manila"), ignoring the last segment of a multi-part address — that's the
 * region or country, which two different cities share. Anything it can't
 * tell counts as a different city: the cautious answer for a travel buffer.
 */
export function sameCity(a: Place, b: Place): boolean {
  const aCity = a.city ? normalize(a.city) : "";
  const bCity = b.city ? normalize(b.city) : "";
  if (aCity && bCity) return aCity === bCity;
  if (aCity && b.text) return segments(b.text).includes(aCity);
  if (bCity && a.text) return segments(a.text).includes(bCity);
  if (a.text && b.text) {
    const local = (t: string) => {
      const s = segments(t);
      return s.length > 1 ? s.slice(0, -1) : s;
    };
    const aParts = new Set(local(a.text));
    return local(b.text).some((s) => aParts.has(s));
  }
  return false;
}

/** UTC calendar days a range touches, inclusive; an end at exactly midnight
 * belongs to the day before. */
function dayKeys(start: Date, end: Date): string[] {
  const last = new Date(end);
  if (last > start && last.getTime() % DAY_MS === 0) {
    last.setTime(last.getTime() - 1);
  }
  last.setUTCHours(0, 0, 0, 0);
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const keys: string[] = [];
  while (cursor <= last) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function shiftDay(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The widened window to look in: the range plus a travel day each side. */
export function bufferedWindow(start: Date, end: Date) {
  return {
    start: new Date(start.getTime() - 2 * DAY_MS),
    end: new Date(end.getTime() + 2 * DAY_MS),
  };
}

/**
 * Every live booking this provider holds that touches `window` — across all
 * of their services, from both events (template / bid transactions) and
 * direct bookings.
 */
export async function findProviderEngagements(
  db: AppTransactionClient | typeof prisma,
  ownerId: string,
  window: { start: Date; end: Date },
  opts: { excludeBookingId?: string; excludeEventId?: string | null } = {},
): Promise<ProviderEngagement[]> {
  const bookingExclusion = opts.excludeBookingId
    ? {
        OR: [
          { bookingId: null },
          { bookingId: { not: opts.excludeBookingId } },
        ],
      }
    : {};

  const [eventRows, directRows] = await Promise.all([
    db.eventServiceTransaction.findMany({
      where: {
        service: { ownerId },
        status: { in: [...RESERVING_TRANSACTION_STATUSES] },
        event: { startAt: { lt: window.end }, endAt: { gt: window.start } },
        // Two slots at the same event are one engagement, not a clash.
        ...(opts.excludeEventId
          ? { eventId: { not: opts.excludeEventId } }
          : {}),
        ...bookingExclusion,
      },
      select: {
        eventId: true,
        event: {
          select: {
            startAt: true,
            endAt: true,
            targetCity: true,
            venueTransactions: {
              select: { venue: { select: { city: true } } },
              take: 1,
            },
          },
        },
      },
    }),
    db.serviceBooking.findMany({
      where: {
        service: { ownerId },
        status: { notIn: ["cancelled", "disputed"] },
        scheduledDate: { lt: window.end },
        OR: [
          { endDate: { gt: window.start } },
          { endDate: null, scheduledDate: { gt: window.start } },
        ],
      },
      select: { scheduledDate: true, endDate: true, location: true },
    }),
  ]);

  return [
    ...eventRows.map((r) => ({
      start: r.event.startAt,
      end: r.event.endAt,
      eventId: r.eventId,
      place: {
        city:
          r.event.targetCity ??
          r.event.venueTransactions[0]?.venue.city ??
          null,
      },
    })),
    ...directRows.map((r) => ({
      start: r.scheduledDate,
      end: r.endDate ?? r.scheduledDate,
      eventId: null,
      place: { text: r.location },
    })),
  ];
}

/** Where the booking being checked happens. */
export async function resolvePlace(
  db: AppTransactionClient | typeof prisma,
  item: Pick<AvailabilityCheckItem, "eventId" | "location">,
): Promise<Place> {
  if (item.eventId) {
    const event = await db.event.findUnique({
      where: { id: item.eventId },
      select: {
        targetCity: true,
        venueTransactions: {
          select: { venue: { select: { city: true } } },
          take: 1,
        },
      },
    });
    return {
      city:
        event?.targetCity ?? event?.venueTransactions[0]?.venue.city ?? null,
    };
  }
  return { text: item.location ?? null };
}

/**
 * Why a new booking on `range` at `place` can't go ahead, if it can't:
 * "booked" — the provider already works one of those days;
 * "travel" — they work in another city the day before or after.
 */
export function findScheduleConflict(
  range: { start: Date; end: Date },
  place: Place,
  engagements: ProviderEngagement[],
): "booked" | "travel" | null {
  const wanted = new Set(dayKeys(range.start, range.end));
  let travel = false;
  for (const e of engagements) {
    const days = dayKeys(e.start, e.end);
    if (days.some((d) => wanted.has(d))) return "booked";
    if (!travel && !sameCity(place, e.place)) {
      const before = shiftDay(days[0], -1);
      const after = shiftDay(days[days.length - 1], 1);
      if (wanted.has(before) || wanted.has(after)) travel = true;
    }
  }
  return travel ? "travel" : null;
}

/**
 * For the booking calendar: days the provider is booked, and the extra days
 * a booking at `requestPlace` can't use because the provider is working in
 * another city the day before or after. With no `requestPlace` yet, every
 * travel day counts — the citizen hasn't said where their event is.
 */
export function providerBlockedDays(
  engagements: ProviderEngagement[],
  requestPlace: Place | null,
): { booked: string[]; travel: string[] } {
  const booked = new Set<string>();
  const travel = new Set<string>();
  for (const e of engagements) {
    const days = dayKeys(e.start, e.end);
    days.forEach((d) => booked.add(d));
    if (!requestPlace || !sameCity(requestPlace, e.place)) {
      travel.add(shiftDay(days[0], -1));
      travel.add(shiftDay(days[days.length - 1], 1));
    }
  }
  booked.forEach((d) => travel.delete(d));
  return { booked: [...booked].sort(), travel: [...travel].sort() };
}
