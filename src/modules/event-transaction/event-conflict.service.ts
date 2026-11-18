import { prisma } from "../../utils/prisma";
import NotificationSvc from "../notifications/user-notification.service";

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
}

export interface EventNeedingAttention {
  eventId: string;
  eventName: string;
  startAt: Date;
  issues: ConflictIssue[];
}

/** A booked item still counts only while it is waiting or approved. */
const LIVE = ["pending", "pending_provider_confirmation", "approved"] as const;

/** Listing statuses that mean the Supplier no longer offers it. */
const ASSET_GONE = ["draft", "pending", "archived", "rejected"];
const SERVICE_GONE = ["draft", "pending", "paused", "archived", "rejected"];

/** A calendar day, the way the rest of the booking code keys days. */
export const dayKey = (d: Date) => d.toISOString().split("T")[0];

/**
 * Whether a blocked day falls on an event. By calendar day, so a day blocked
 * after a booking that starts later that same day still counts (the booking
 * availability check compares timestamps and would miss that).
 */
export function blockedDayHitsEvent(
  blocked: Date[],
  event: { startAt: Date; endAt: Date },
): boolean {
  const from = dayKey(event.startAt);
  const to = dayKey(event.endAt);
  return blocked.some((d) => {
    const k = dayKey(d);
    return k >= from && k <= to;
  });
}

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
      select: {
        id: true,
        name: true,
        startAt: true,
        endAt: true,
        assetTransactions: {
          select: {
            id: true,
            status: true,
            rejectionReason: true,
            provider: { select: { name: true } },
            asset: { select: { name: true, status: true, deletedAt: true } },
          },
        },
        serviceTransactions: {
          select: {
            id: true,
            status: true,
            rejectionReason: true,
            provider: { select: { name: true } },
            service: { select: { name: true, status: true, deletedAt: true } },
          },
        },
        venueTransactions: {
          select: {
            id: true,
            status: true,
            rejectionReason: true,
            provider: { select: { name: true } },
            venue: { select: { name: true, blockedDates: true } },
          },
        },
      },
    });

    const live = (s: string) => (LIVE as readonly string[]).includes(s);
    const declined = (t: { status: string; rejectionReason: string | null }) =>
      t.status === "rejected" && t.rejectionReason === "supplier_declined";

    const out: EventNeedingAttention[] = [];
    for (const e of events) {
      const issues: ConflictIssue[] = [];

      for (const t of e.assetTransactions) {
        const base = {
          kind: "asset" as const,
          transactionId: t.id,
          supplierName: t.provider.name,
          itemName: t.asset.name,
        };
        if (declined(t)) issues.push({ ...base, reason: "declined" });
        else if (
          live(t.status) &&
          (ASSET_GONE.includes(t.asset.status) || t.asset.deletedAt)
        ) {
          issues.push({ ...base, reason: "unavailable" });
        }
      }
      for (const t of e.serviceTransactions) {
        const base = {
          kind: "service" as const,
          transactionId: t.id,
          supplierName: t.provider.name,
          itemName: t.service.name,
        };
        if (declined(t)) issues.push({ ...base, reason: "declined" });
        else if (
          live(t.status) &&
          (SERVICE_GONE.includes(t.service.status) || t.service.deletedAt)
        ) {
          issues.push({ ...base, reason: "unavailable" });
        }
      }
      for (const t of e.venueTransactions) {
        const base = {
          kind: "venue" as const,
          transactionId: t.id,
          supplierName: t.provider.name,
          itemName: t.venue.name,
        };
        if (declined(t)) issues.push({ ...base, reason: "declined" });
        else if (
          live(t.status) &&
          blockedDayHitsEvent(t.venue.blockedDates, e)
        ) {
          issues.push({ ...base, reason: "date_blocked" });
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
              select: { asset: { select: { name: true } }, event: eventSelect },
            })
          ).map((r) => ({ name: r.asset.name, event: r.event }))
        : (
            await prisma.eventServiceTransaction.findMany({
              where: { ...where, serviceId: itemId },
              select: {
                service: { select: { name: true } },
                event: eventSelect,
              },
            })
          ).map((r) => ({ name: r.service.name, event: r.event }));

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
        metadata: { eventId: item.event.id, reason, supplier: item.supplier },
      }).catch((err) =>
        console.error(`Conflict notification failed for ${key}`, err),
      );
    }
  }
}
