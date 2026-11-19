import type { EventEditProposalStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { notFound } from "../../utils/errors";
import NotificationSvc from "../notifications/user-notification.service";
import { blockedDayHitsRange, dayKey } from "../availability/blocked-days";

export { dayKey };

/**
 * Booked events that have lost, or are about to lose, a Supplier (ADR 0010).
 * Nothing is stored: a problem is worked out from the live rows each time it
 * is read, so it clears by itself once the Supplier is replaced or the Mayor
 * unblocks the day. A conflict never refuses the Supplier's change; it is
 * allowed and flagged here, and the Event Foxer is told.
 */

export type ConflictKind = "asset" | "service" | "venue";

export type ConflictReason =
  /** The Supplier declined the booked event. */
  | "declined"
  /** The Mayor blocked a day the event falls on. */
  | "date_blocked"
  /** The gear or service was paused, archived or removed. */
  | "unavailable";

export interface ConflictIssue {
  kind: ConflictKind;
  transactionId: string;
  supplierName: string;
  itemName: string;
  reason: ConflictReason;
  /** "busy" when a declining Supplier has another booking then. */
  cause: "busy" | null;
  /** A replacement the host proposed, waiting for the citizen's answer. */
  pendingProposalId: string | null;
  /** When the citizen may cancel for a full refund if it isn't replaced. */
  replaceBy: Date | null;
}

export interface EventNeedingAttention {
  eventId: string;
  eventName: string;
  startAt: Date;
  issues: ConflictIssue[];
}

/** One Supplier of a booked event and where it stands. */
export interface BookedSupplierRow {
  kind: ConflictKind;
  transactionId: string;
  supplierName: string;
  itemName: string;
  status: string;
  /** Set when this Supplier needs replacing. */
  reason: ConflictReason | null;
  /** "busy" when a declining Supplier has another booking then. */
  cause: "busy" | null;
  /** A replacement the host proposed, waiting for the citizen's answer. */
  pendingProposalId: string | null;
  /** When the citizen may cancel for a full refund if it isn't replaced. */
  replaceBy: Date | null;
}

export interface BookedEventDetail {
  eventId: string;
  eventName: string;
  startAt: Date;
  endAt: Date;
  eventStatus: string;
  suppliers: BookedSupplierRow[];
  /**
   * The event's booking that is not paid yet, which the host may still
   * decline (ADR 0011); null once it is paid or when there is none.
   */
  declinableBookingId: string | null;
}

/** A booked item still counts only while it is waiting or approved. */
const LIVE = ["pending", "pending_provider_confirmation", "approved"] as const;

/** Listing statuses that mean the Supplier no longer offers it. */
const ASSET_GONE = ["draft", "pending", "archived", "rejected"];
const SERVICE_GONE = ["draft", "pending", "paused", "archived", "rejected"];

/**
 * Whether a blocked day falls on an event. By calendar day, so a day blocked
 * after a booking that starts later that same day still counts. The same rule
 * the booking check uses (`blockedDayHitsRange`).
 */
export function blockedDayHitsEvent(
  blocked: Date[],
  event: { startAt: Date; endAt: Date },
): boolean {
  return blockedDayHitsRange(blocked, event.startAt, event.endAt);
}

/** How long the host has to replace a Supplier (ADR 0010, decided 2026-11-19). */
export const REPLACE_HOURS = 48;
/** The deadline never falls later than this long before the event starts. */
export const REPLACE_CAP_HOURS_BEFORE = 24;
const HOUR = 3_600_000;

/**
 * When a line that started needing a replacement at [since] must be replaced
 * by: 48 hours later, but never later than 24 hours before the event. Past it,
 * the citizen may cancel for a full refund. A dropout inside the last day is
 * therefore due at once.
 */
export function replaceByFor(since: Date, eventStart: Date): Date {
  return new Date(
    Math.min(
      since.getTime() + REPLACE_HOURS * HOUR,
      eventStart.getTime() - REPLACE_CAP_HOURS_BEFORE * HOUR,
    ),
  );
}

/** The event fields both reads need, with every Supplier row. */
const EVENT_WITH_SUPPLIERS = {
  id: true,
  name: true,
  startAt: true,
  endAt: true,
  eventStatus: true,
  assetTransactions: {
    select: {
      id: true,
      status: true,
      rejectionReason: true,
      attentionSince: true,
      updatedAt: true,
      provider: { select: { name: true } },
      asset: { select: { name: true, status: true, deletedAt: true } },
    },
  },
  serviceTransactions: {
    select: {
      id: true,
      status: true,
      rejectionReason: true,
      attentionSince: true,
      updatedAt: true,
      provider: { select: { name: true } },
      service: { select: { name: true, status: true, deletedAt: true } },
    },
  },
  venueTransactions: {
    select: {
      id: true,
      status: true,
      rejectionReason: true,
      attentionSince: true,
      updatedAt: true,
      provider: { select: { name: true } },
      venue: { select: { name: true, blockedDates: true } },
    },
  },
  // Replacements (ADR 0010): a replaced line is no longer part of the event,
  // and one with a proposal waiting shows it.
  editProposals: {
    where: {
      status: {
        in: ["pending", "accepted"] as EventEditProposalStatus[],
      },
    },
    select: {
      id: true,
      status: true,
      replacesTransactionId: true,
      appliedTransactionId: true,
    },
  },
} as const;

type EventRow = {
  startAt: Date;
  endAt: Date;
  assetTransactions: {
    id: string;
    status: string;
    rejectionReason: string | null;
    attentionSince?: Date | null;
    updatedAt?: Date;
    provider: { name: string };
    asset: { name: string; status: string; deletedAt: Date | null };
  }[];
  serviceTransactions: {
    id: string;
    status: string;
    rejectionReason: string | null;
    attentionSince?: Date | null;
    updatedAt?: Date;
    provider: { name: string };
    service: { name: string; status: string; deletedAt: Date | null };
  }[];
  venueTransactions: {
    id: string;
    status: string;
    rejectionReason: string | null;
    attentionSince?: Date | null;
    updatedAt?: Date;
    provider: { name: string };
    venue: { name: string; blockedDates: Date[] };
  }[];
  editProposals?: {
    id: string;
    status: string;
    replacesTransactionId: string;
    appliedTransactionId: string | null;
  }[];
};

const isLive = (status: string) => (LIVE as readonly string[]).includes(status);
const isDeclined = (t: { status: string; rejectionReason: string | null }) =>
  t.status === "rejected" &&
  (t.rejectionReason === "supplier_declined" ||
    t.rejectionReason === "supplier_declined_busy");
/**
 * A replacement whose new Supplier turned it down or let it lapse: the line
 * needs replacing again, as if it had been declined.
 */
const replacementFell = (t: {
  status: string;
  rejectionReason: string | null;
}) =>
  t.status === "rejected" &&
  (t.rejectionReason === "provider_declined" ||
    t.rejectionReason === "deadline_expired");
/** Set when the Supplier said it has another booking at that time. */
const declineCause = (t: { rejectionReason: string | null }): "busy" | null =>
  t.rejectionReason === "supplier_declined_busy" ? "busy" : null;

/** Every Supplier of an event, each with why it needs replacing, if it does. */
function supplierRows(e: EventRow): BookedSupplierRow[] {
  type Raw = Omit<BookedSupplierRow, "pendingProposalId" | "replaceBy">;
  const raw: Raw[] = [];
  const rows = { push: (r: Raw) => raw.push(r) };

  for (const t of e.assetTransactions) {
    rows.push({
      kind: "asset",
      transactionId: t.id,
      supplierName: t.provider.name,
      itemName: t.asset.name,
      status: t.status,
      cause: isDeclined(t) ? declineCause(t) : null,
      reason: isDeclined(t)
        ? "declined"
        : isLive(t.status) &&
            (ASSET_GONE.includes(t.asset.status) || t.asset.deletedAt)
          ? "unavailable"
          : null,
    });
  }
  for (const t of e.serviceTransactions) {
    rows.push({
      kind: "service",
      transactionId: t.id,
      supplierName: t.provider.name,
      itemName: t.service.name,
      status: t.status,
      cause: isDeclined(t) ? declineCause(t) : null,
      reason: isDeclined(t)
        ? "declined"
        : isLive(t.status) &&
            (SERVICE_GONE.includes(t.service.status) || t.service.deletedAt)
          ? "unavailable"
          : null,
    });
  }
  for (const t of e.venueTransactions) {
    rows.push({
      kind: "venue",
      transactionId: t.id,
      supplierName: t.provider.name,
      itemName: t.venue.name,
      status: t.status,
      cause: isDeclined(t) ? declineCause(t) : null,
      reason: isDeclined(t)
        ? "declined"
        : isLive(t.status) && blockedDayHitsEvent(t.venue.blockedDates, e)
          ? "date_blocked"
          : null,
    });
  }

  const proposals = e.editProposals ?? [];
  const replaced = new Set(
    proposals
      .filter((p) => p.status === "accepted")
      .map((p) => p.replacesTransactionId),
  );
  const replacements = new Set(
    proposals
      .filter((p) => p.status === "accepted" && p.appliedTransactionId)
      .map((p) => p.appliedTransactionId!),
  );
  const waiting = new Map(
    proposals
      .filter((p) => p.status === "pending")
      .map((p) => [p.replacesTransactionId, p.id] as const),
  );
  const statusOf = new Map<
    string,
    {
      status: string;
      rejectionReason: string | null;
      attentionSince?: Date | null;
      updatedAt?: Date;
    }
  >(
    [
      ...e.assetTransactions,
      ...e.serviceTransactions,
      ...e.venueTransactions,
    ].map((t) => [t.id, t] as const),
  );
  return raw
    .filter((r) => !replaced.has(r.transactionId))
    .map((r) => {
      const t = statusOf.get(r.transactionId)!;
      const fell = replacements.has(r.transactionId) && replacementFell(t);
      const reason = fell ? ("declined" as const) : r.reason;
      // A line stamped when it started needing a replacement. One from before
      // the stamp existed: a decline is its last change, so that stands in; a
      // conflict (blocked day, listing gone) changed nothing on the line, so it
      // gets no deadline until the next block or removal stamps it.
      const since =
        t.attentionSince ??
        (reason === "declined" ? t.updatedAt : null) ??
        null;
      return {
        ...r,
        reason,
        pendingProposalId: waiting.get(r.transactionId) ?? null,
        replaceBy: reason && since ? replaceByFor(since, e.startAt) : null,
      };
    });
}

/** Where the Event Foxer is sent: a valid page on the web, and mobile's too. */
const eventLink = (eventId: string) =>
  `/creator-dashboard/events?eventId=${encodeURIComponent(eventId)}`;

export default class EventConflictSvc {
  /**
   * The Event Foxer's upcoming events that need a replacement Supplier, with
   * which Supplier and why, soonest first.
   */
  static async needsAttention(
    userId: string,
    now: Date = new Date(),
  ): Promise<EventNeedingAttention[]> {
    const events = await prisma.event.findMany({
      where: {
        organizerId: userId,
        endAt: { gt: now },
        eventStatus: { notIn: ["cancelled", "completed"] },
      },
      orderBy: { startAt: "asc" },
      select: EVENT_WITH_SUPPLIERS,
    });

    const out: EventNeedingAttention[] = [];
    for (const e of events) {
      const issues: ConflictIssue[] = [];
      for (const r of supplierRows(e)) {
        if (r.reason) {
          issues.push({
            kind: r.kind,
            transactionId: r.transactionId,
            supplierName: r.supplierName,
            itemName: r.itemName,
            reason: r.reason,
            cause: r.cause,
            pendingProposalId: r.pendingProposalId,
            replaceBy: r.replaceBy,
          });
        }
      }
      if (issues.length > 0) {
        out.push({
          eventId: e.id,
          eventName: e.name,
          startAt: e.startAt,
          issues,
        });
      }
    }
    return out;
  }

  /**
   * One of the person's own events with every Supplier on it and where each
   * stands, so a Supplier that needs replacing can be seen in place. Only the
   * event's own host can read it; anyone else gets "not found".
   */
  static async eventDetail(
    userId: string,
    eventId: string,
  ): Promise<BookedEventDetail> {
    const e = await prisma.event.findFirst({
      where: { id: eventId, organizerId: userId },
      select: EVENT_WITH_SUPPLIERS,
    });
    if (!e) throw notFound("Event");
    const unpaid = await prisma.booking.findFirst({
      where: { eventId: e.id, status: "pending" },
      select: { id: true },
    });
    return {
      declinableBookingId: unpaid?.id ?? null,
      eventId: e.id,
      eventName: e.name,
      startAt: e.startAt,
      endAt: e.endAt,
      eventStatus: e.eventStatus,
      // A cancelled line is gone from the event; the rest are shown, with the
      // ones to replace marked.
      suppliers: supplierRows(e).filter((r) => r.status !== "cancelled"),
    };
  }

  /**
   * Whether an event has a Supplier that was not replaced by its deadline, so
   * its citizen may cancel for a full refund (ADR 0010 decision 2).
   */
  static async fullRefundDue(
    eventId: string | null | undefined,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!eventId) return false;
    const e = await prisma.event.findUnique({
      where: { id: eventId },
      select: EVENT_WITH_SUPPLIERS,
    });
    if (!e) return false;
    return supplierRows(e).some(
      (r) =>
        r.status !== "cancelled" &&
        r.reason !== null &&
        r.replaceBy !== null &&
        r.replaceBy <= now,
    );
  }

  /**
   * For a booking's citizen (or its host): which Suppliers need replacing,
   * by when, and whether cancelling now refunds in full. Anyone else gets
   * "not found".
   */
  static async replacementForBooking(
    userId: string,
    bookingId: string,
    now: Date = new Date(),
  ) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        userId: true,
        eventId: true,
        event: { select: EVENT_WITH_SUPPLIERS },
      },
    });
    const e = booking?.event;
    if (
      !booking ||
      !e ||
      (booking.userId !== userId &&
        (await prisma.event.count({
          where: { id: e.id, organizerId: userId },
        })) === 0)
    ) {
      throw notFound("Booking");
    }
    const items = supplierRows(e)
      .filter((r) => r.status !== "cancelled" && r.reason !== null)
      .map((r) => ({
        kind: r.kind,
        itemName: r.itemName,
        reason: r.reason!,
        replaceBy: r.replaceBy,
        pendingProposalId: r.pendingProposalId,
      }));
    const due = items
      .map((i) => i.replaceBy)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    return {
      items,
      replaceBy: due[0] ?? null,
      fullRefund: due.length > 0 && due[0] <= now,
    };
  }

  /**
   * A Mayor blocked a day: tells the Event Foxer of every upcoming event held
   * at the venue on that day. Best effort; the block has already been saved.
   */
  static async notifyDayBlocked(
    venueId: string,
    blockedDate: Date,
    now: Date = new Date(),
  ) {
    const rows = await prisma.eventVenueTransaction.findMany({
      where: {
        venueId,
        status: { in: [...LIVE] },
        event: {
          endAt: { gt: now },
          eventStatus: { notIn: ["cancelled", "completed"] },
        },
      },
      select: {
        id: true,
        venue: { select: { name: true } },
        event: {
          select: {
            id: true,
            name: true,
            organizerId: true,
            startAt: true,
            endAt: true,
          },
        },
      },
    });
    const hit = rows.filter((r) => blockedDayHitsEvent([blockedDate], r.event));
    if (hit.length > 0) {
      // The replacement deadline runs from the first conflict, not the latest.
      await prisma.eventVenueTransaction.updateMany({
        where: { id: { in: hit.map((r) => r.id) }, attentionSince: null },
        data: { attentionSince: now },
      });
    }
    await this.notifyOrganizers(
      hit.map((r) => ({
        event: r.event,
        text: `${r.venue.name} is now blocked on ${dayKey(blockedDate)}, a day of ${r.event.name}. Pick another venue or date.`,
        supplier: r.venue.name,
      })),
      "date_blocked",
    );
    return hit.length;
  }

  /**
   * A listing was paused, archived or removed: tells the Event Foxer of every
   * upcoming event that has it booked. Best effort.
   */
  static async notifyListingGone(
    kind: "asset" | "service",
    itemId: string,
    now: Date = new Date(),
  ) {
    const where = {
      status: { in: [...LIVE] },
      event: {
        endAt: { gt: now },
        eventStatus: { notIn: ["cancelled" as const, "completed" as const] },
      },
    };
    const eventSelect = {
      select: { id: true, name: true, organizerId: true },
    };
    const found =
      kind === "asset"
        ? (
            await prisma.eventAssetTransaction.findMany({
              where: { ...where, assetId: itemId },
              select: {
                id: true,
                asset: { select: { name: true } },
                event: eventSelect,
              },
            })
          ).map((r) => ({ id: r.id, name: r.asset.name, event: r.event }))
        : (
            await prisma.eventServiceTransaction.findMany({
              where: { ...where, serviceId: itemId },
              select: {
                id: true,
                service: { select: { name: true } },
                event: eventSelect,
              },
            })
          ).map((r) => ({ id: r.id, name: r.service.name, event: r.event }));

    if (found.length > 0) {
      const stamp = {
        where: { id: { in: found.map((r) => r.id) }, attentionSince: null },
        data: { attentionSince: now },
      };
      if (kind === "asset") {
        await prisma.eventAssetTransaction.updateMany(stamp);
      } else {
        await prisma.eventServiceTransaction.updateMany(stamp);
      }
    }

    await this.notifyOrganizers(
      found.map((r) => ({
        event: r.event,
        text: `${r.name} is no longer available for ${r.event.name}. Pick a replacement.`,
        supplier: r.name,
      })),
      "unavailable",
    );
    return found.length;
  }

  /** One notification per Event Foxer and event, even if several items clash. */
  private static async notifyOrganizers(
    items: {
      event: { id: string; name: string; organizerId: string };
      text: string;
      supplier: string;
    }[],
    reason: ConflictReason,
  ) {
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.event.organizerId}:${item.event.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await NotificationSvc.create({
        userId: item.event.organizerId,
        type: "EVENT_CONFLICT",
        title: "Your event needs a replacement",
        message: item.text,
        metadata: {
          eventId: item.event.id,
          reason,
          supplier: item.supplier,
          link: eventLink(item.event.id),
        },
      }).catch((err) =>
        console.error(`Conflict notification failed for ${key}`, err),
      );
    }
  }
}

export { eventLink };
