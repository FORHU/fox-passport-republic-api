import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { AppError, notFound } from "../../utils/errors";
import {
  bookingLink,
  providerRequestsLink,
} from "../../utils/notification-links";
import NotificationSvc from "../notifications/user-notification.service";
import AvailabilitySvc from "../availability/availability.service";
import {
  AvailabilityConflictError,
  type AvailabilityCheckItem,
} from "../availability/availability.types";
import EventConflictSvc, {
  eventLink,
  type ConflictKind,
  type ConflictReason,
} from "./event-conflict.service";
import {
  acceptedMatchListings,
  approvedVenuePartners,
} from "../event-template/template-partners";
import { announceToUser } from "../../infrastructure/socket/invalidate";

/**
 * Moving a booked package event to another date (ADR 0010 decision 6). The
 * Event Foxer proposes a new start; the event keeps its length. Every Supplier
 * still on the event must be free then, or the proposal is refused, so a
 * change never half-applies. Nothing moves until the citizen accepts. On
 * acceptance the event and its booking move; a partner stays booked, and every
 * other Supplier confirms the new date within CONFIRM_HOURS, as for any item
 * added to a booking.
 *
 * Agreed prices don't depend on the date, so the total stays the same and a
 * paid booking has nothing to settle.
 */

/** Both the current and the new start must be at least this far away. */
export const RESCHEDULE_MIN_LEAD_HOURS = 48;
/** How long the citizen has to answer (the same as for a swap). */
export const RESCHEDULE_PROPOSAL_HOURS = 48;
/** How long a Supplier who isn't a partner has to confirm the new date. */
const CONFIRM_HOURS = 24;
const HOUR = 3_600_000;
const LIVE = ["pending", "pending_provider_confirmation", "approved"] as const;
/** Bookings that can still change: unpaid, or paid and to come. */
const EDITABLE = ["pending", "confirmed"];

/**
 * Lines that are not checked or moved to re-confirm: the listing was paused or
 * removed (the availability check doesn't see that), so it is replaced first.
 * A blocked day is checked like any line: the new date may well be free.
 */
const SKIPPED_REASONS: ConflictReason[] = ["unavailable", "declined"];

/** Sentinel used to roll back an availability check that passed. */
class Probe extends Error {}

/** A Supplier line that moves with the event. */
interface LiveLine {
  kind: ConflictKind;
  transactionId: string;
  listingId: string;
  itemName: string;
  supplierName: string;
  providerId: string;
  status: string;
  quantity: number;
  /** Already works with the host, so it stays booked on the new date. */
  partner: boolean;
}

interface SkippedLine {
  kind: ConflictKind;
  transactionId: string;
  itemName: string;
  supplierName: string;
  reason: ConflictReason;
}

export interface ReschedulePreview {
  eventId: string;
  bookingId: string;
  currentStartAt: Date;
  currentEndAt: Date;
  proposedStartAt: Date;
  proposedEndAt: Date;
  /** Every line checked is free on the new dates. */
  available: boolean;
  lines: {
    kind: ConflictKind;
    transactionId: string;
    itemName: string;
    supplierName: string;
    status: string;
    available: boolean;
    /** Must confirm the new date (not a partner). */
    reconfirm: boolean;
  }[];
  /** Lines that need replacing: neither checked nor moved to re-confirm. */
  skipped: SkippedLine[];
  currentPrice: Prisma.Decimal;
  proposedPrice: Prisma.Decimal;
  priceDelta: Prisma.Decimal;
}

/**
 * A date in notifications and the chat, in platform time (Asia/Manila, as the
 * daily caps use), not the server's own zone.
 */
const when = (d: Date) =>
  d.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const names = (lines: { itemName: string }[]) => {
  const n = lines.map((l) => l.itemName);
  return n.length <= 1
    ? n.join("")
    : `${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
};

interface EventRow {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date;
  templateId: string | null;
  clientId: string;
  organizerId: string;
}

const EVENT_SELECT = {
  id: true,
  name: true,
  startAt: true,
  endAt: true,
  templateId: true,
  clientId: true,
  organizerId: true,
} as const;

export default class EventRescheduleSvc {
  /** The host's own event, or 404. */
  private static async event(
    hostId: string,
    eventId: string,
  ): Promise<EventRow> {
    const e = await prisma.event.findFirst({
      where: { id: eventId, organizerId: hostId },
      select: EVENT_SELECT,
    });
    if (!e) throw notFound("Event");
    if (!e.templateId) {
      throw new AppError(
        "Only a booked package event can move to another date this way.",
        409,
        "RESCHEDULE_NOT_SUPPORTED",
      );
    }
    return e;
  }

  /**
   * The event's one booking that can still change. Moving the event moves
   * every booking on it, so more than one is refused.
   */
  private static async booking(eventId: string) {
    const rows = await prisma.booking.findMany({
      where: {
        eventId,
        status: { in: EDITABLE as ("pending" | "confirmed")[] },
      },
      select: {
        id: true,
        userId: true,
        status: true,
        totalAmount: true,
        startAt: true,
        endAt: true,
      },
    });
    if (rows.length === 0) {
      throw new AppError(
        "This booking can no longer be changed.",
        409,
        "BOOKING_NOT_EDITABLE",
      );
    }
    if (rows.length > 1) {
      throw new AppError(
        "This event has more than one booking, so its date can't be changed here.",
        409,
        "RESCHEDULE_NOT_SUPPORTED",
      );
    }
    return rows[0];
  }

  /** The new dates, after the checks every step shares. */
  static checkDates(
    current: { startAt: Date; endAt: Date },
    startAt: Date,
    now: Date,
  ): { start: Date; end: Date } {
    if (Number.isNaN(startAt.getTime())) {
      throw new AppError("Pick a valid new date.", 400, "BAD_REQUEST");
    }
    if (startAt.getTime() === current.startAt.getTime()) {
      throw new AppError(
        "That's the date the event is already on.",
        400,
        "SAME_DATE",
      );
    }
    const earliest = now.getTime() + RESCHEDULE_MIN_LEAD_HOURS * HOUR;
    if (current.startAt.getTime() < earliest || startAt.getTime() < earliest) {
      throw new AppError(
        `A date change needs at least ${RESCHEDULE_MIN_LEAD_HOURS} hours' notice, before both the current and the new start.`,
        400,
        "DATE_TOO_SOON",
      );
    }
    const length = current.endAt.getTime() - current.startAt.getTime();
    return { start: startAt, end: new Date(startAt.getTime() + length) };
  }

  /**
   * The event's live Supplier lines, split into the ones that move with it
   * and the ones that need replacing first.
   */
  private static async lines(
    event: EventRow,
  ): Promise<{ moving: LiveLine[]; skipped: SkippedLine[] }> {
    const detail = await EventConflictSvc.eventDetail(
      event.organizerId,
      event.id,
    );
    const reasonOf = new Map(
      detail.suppliers
        .filter((s) => s.reason)
        .map((s) => [`${s.kind}:${s.transactionId}`, s.reason!] as const),
    );
    const where = { eventId: event.id, status: { in: [...LIVE] } };
    const [assets, services, venues] = await Promise.all([
      prisma.eventAssetTransaction.findMany({
        where,
        select: {
          id: true,
          status: true,
          quantity: true,
          providerId: true,
          assetId: true,
          asset: { select: { name: true } },
          provider: { select: { name: true } },
        },
      }),
      prisma.eventServiceTransaction.findMany({
        where,
        select: {
          id: true,
          status: true,
          providerId: true,
          serviceId: true,
          service: { select: { name: true } },
          provider: { select: { name: true } },
        },
      }),
      prisma.eventVenueTransaction.findMany({
        where,
        select: {
          id: true,
          status: true,
          providerId: true,
          venueId: true,
          venue: { select: { name: true } },
          provider: { select: { name: true } },
        },
      }),
    ]);
    const all: Omit<LiveLine, "partner">[] = [
      ...assets.map((t) => ({
        kind: "asset" as const,
        transactionId: t.id,
        listingId: t.assetId,
        itemName: t.asset.name,
        supplierName: t.provider.name,
        providerId: t.providerId,
        status: t.status,
        quantity: t.quantity || 1,
      })),
      ...services.map((t) => ({
        kind: "service" as const,
        transactionId: t.id,
        listingId: t.serviceId,
        itemName: t.service.name,
        supplierName: t.provider.name,
        providerId: t.providerId,
        status: t.status,
        quantity: 1,
      })),
      ...venues.map((t) => ({
        kind: "venue" as const,
        transactionId: t.id,
        listingId: t.venueId,
        itemName: t.venue.name,
        supplierName: t.provider.name,
        providerId: t.providerId,
        status: t.status,
        quantity: 1,
      })),
    ];

    // Declined lines are no longer live, so they come from the read itself.
    const skipped: SkippedLine[] = detail.suppliers
      .filter((s) => s.reason && SKIPPED_REASONS.includes(s.reason))
      .map((s) => ({
        kind: s.kind,
        transactionId: s.transactionId,
        itemName: s.itemName,
        supplierName: s.supplierName,
        reason: s.reason!,
      }));
    const kept = all.filter((l) => {
      const reason = reasonOf.get(`${l.kind}:${l.transactionId}`);
      return !(reason && SKIPPED_REASONS.includes(reason));
    });

    const ids = (k: ConflictKind) =>
      kept.filter((l) => l.kind === k).map((l) => l.listingId);
    const [assetPartners, servicePartners, venueMatches, venueAffiliations] =
      await Promise.all([
        acceptedMatchListings(event.organizerId, "asset", ids("asset")),
        acceptedMatchListings(event.organizerId, "service", ids("service")),
        acceptedMatchListings(event.organizerId, "venue", ids("venue")),
        approvedVenuePartners(event.organizerId, ids("venue")),
      ]);
    const isPartner = (l: Omit<LiveLine, "partner">) =>
      l.kind === "asset"
        ? assetPartners.has(l.listingId)
        : l.kind === "service"
          ? servicePartners.has(l.listingId)
          : venueMatches.has(l.listingId) || venueAffiliations.has(l.listingId);
    return {
      moving: kept.map((l) => ({ ...l, partner: isPartner(l) })),
      skipped,
    };
  }

  private static checkItem(
    eventId: string,
    l: LiveLine,
    range: { start: Date; end: Date },
  ): AvailabilityCheckItem {
    return {
      kind: l.kind,
      itemId: l.listingId,
      dateRange: range,
      eventId: l.kind === "service" ? eventId : undefined,
      quantity: l.kind === "asset" ? l.quantity : undefined,
    };
  }

  /**
   * Whether a line's listing is free on the new dates, without reserving it.
   * The booking's own lines don't count against it, so a new date that
   * overlaps the current one is judged fairly.
   */
  private static async isFree(
    bookingId: string,
    item: AvailabilityCheckItem,
  ): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        await AvailabilitySvc.validateForCheckout(tx, bookingId, [item]);
        throw new Probe();
      });
    } catch (err) {
      if (err instanceof Probe) return true;
      if (err instanceof AvailabilityConflictError) return false;
      throw err;
    }
    return true;
  }

  private static async check(
    event: EventRow,
    bookingId: string,
    range: { start: Date; end: Date },
  ) {
    const { moving, skipped } = await this.lines(event);
    const checked: (LiveLine & { available: boolean })[] = [];
    for (const l of moving) {
      checked.push({
        ...l,
        available: await this.isFree(
          bookingId,
          this.checkItem(event.id, l, range),
        ),
      });
    }
    return { checked, skipped };
  }

  /** What moving the event to `startAt` would mean, for the host to review. */
  static async preview(
    hostId: string,
    eventId: string,
    startAt: Date,
    now: Date = new Date(),
  ): Promise<ReschedulePreview> {
    const event = await this.event(hostId, eventId);
    const booking = await this.booking(event.id);
    const range = this.checkDates(event, startAt, now);
    const { checked, skipped } = await this.check(event, booking.id, range);
    const zero = new Prisma.Decimal(0);
    return {
      eventId: event.id,
      bookingId: booking.id,
      currentStartAt: event.startAt,
      currentEndAt: event.endAt,
      proposedStartAt: range.start,
      proposedEndAt: range.end,
      available: checked.every((l) => l.available),
      lines: checked.map((l) => ({
        kind: l.kind,
        transactionId: l.transactionId,
        itemName: l.itemName,
        supplierName: l.supplierName,
        status: l.status,
        available: l.available,
        reconfirm: !l.partner,
      })),
      skipped,
      currentPrice: booking.totalAmount,
      proposedPrice: booking.totalAmount,
      priceDelta: zero,
    };
  }

  /** Refuses while another change to the booking waits for an answer. */
  private static async noOpenProposal(bookingId: string, now: Date) {
    // A date change no one answered in time ends here (it holds no payment),
    // so it doesn't block a new one through the unique index.
    await prisma.eventEditProposal.updateMany({
      where: {
        bookingId,
        type: "reschedule",
        status: "pending",
        expiresAt: { lt: now },
      },
      data: { status: "expired" },
    });
    const open = await prisma.eventEditProposal.count({
      where: { bookingId, status: "pending", expiresAt: { gte: now } },
    });
    if (open > 0) throw pendingError();
  }

  /**
   * The host proposes moving the event. The citizen is told, and the proposal
   * is posted to the event's chat with them.
   */
  static async propose(
    hostId: string,
    eventId: string,
    input: { startAt: Date; note?: string },
    now: Date = new Date(),
  ) {
    const event = await this.event(hostId, eventId);
    const booking = await this.booking(event.id);
    const range = this.checkDates(event, input.startAt, now);
    await this.noOpenProposal(booking.id, now);

    const { checked } = await this.check(event, booking.id, range);
    const busy = checked.filter((l) => !l.available);
    if (busy.length > 0) {
      throw new AppError(
        `${names(busy)} ${busy.length === 1 ? "isn't" : "aren't"} free then. Pick another date, or replace ${busy.length === 1 ? "it" : "them"} first.`,
        409,
        "AVAILABILITY_CONFLICT",
      );
    }

    let proposal;
    try {
      proposal = await prisma.eventEditProposal.create({
        data: {
          type: "reschedule",
          eventId: event.id,
          bookingId: booking.id,
          proposedById: hostId,
          proposedStartAt: range.start,
          proposedEndAt: range.end,
          previousStartAt: event.startAt,
          previousEndAt: event.endAt,
          currentPrice: booking.totalAmount,
          proposedPrice: booking.totalAmount,
          priceDelta: new Prisma.Decimal(0),
          note: input.note?.trim() || null,
          expiresAt: new Date(now.getTime() + RESCHEDULE_PROPOSAL_HOURS * HOUR),
        },
      });
    } catch (err) {
      // The partial unique index: another date change got there first.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw pendingError();
      }
      throw err;
    }

    await this.tellCitizen(booking.userId, event, proposal).catch((e) =>
      console.error(`Reschedule ${proposal.id} was not announced`, e),
    );
    announceToUser(booking.userId, "bookings");
    return proposal;
  }

  private static async tellCitizen(
    citizenId: string,
    event: EventRow,
    proposal: {
      id: string;
      bookingId: string;
      proposedStartAt: Date | null;
      note: string | null;
    },
  ) {
    const text = `The host proposes moving ${event.name} from ${when(event.startAt)} to ${when(proposal.proposedStartAt!)}. Open your booking to accept or decline.`;
    await NotificationSvc.create({
      userId: citizenId,
      type: "EVENT_RESCHEDULE_PROPOSED",
      title: "Your host proposes a new date",
      message: text,
      metadata: {
        link: bookingLink(proposal.bookingId),
        bookingId: proposal.bookingId,
        proposalId: proposal.id,
        proposalType: "reschedule",
      },
    });
    // The event's chat with the citizen (the Shared Inbox, ADR 0005), as for a
    // swap. The answer itself is given on the proposal.
    const { default: ConversationService } =
      await import("../conversations/conversation.service");
    const thread = (await ConversationService.startInboxConversation(
      event.organizerId,
      { eventId: event.id, guestId: citizenId },
    )) as { id: string };
    await ConversationService.sendMessage({
      conversationId: thread.id,
      senderId: event.organizerId,
      content: proposal.note ? `${text} "${proposal.note}"` : text,
    });
  }

  /** Ends a date change that can't apply any more, and says why. */
  private static async end(id: string, err: AppError): Promise<never> {
    await prisma.eventEditProposal.updateMany({
      where: { id, status: "pending" },
      data: { status: "expired" },
    });
    throw err;
  }

  /**
   * The citizen accepts a date change (EventEditSvc.accept has checked it is
   * theirs, open and on an editable booking). Re-checks the dates, the price
   * and every Supplier, then moves the event and its booking at once.
   */
  static async accept(
    p: {
      id: string;
      eventId: string;
      bookingId: string;
      proposedPrice: Prisma.Decimal;
      proposedStartAt: Date | null;
      proposedEndAt: Date | null;
      previousStartAt: Date | null;
    },
    now: Date = new Date(),
  ) {
    const event = await prisma.event.findUnique({
      where: { id: p.eventId },
      select: EVENT_SELECT,
    });
    const booking = await prisma.booking.findUnique({
      where: { id: p.bookingId },
      select: { totalAmount: true, startAt: true, endAt: true },
    });
    if (!event || !booking || !p.proposedStartAt || !p.proposedEndAt) {
      throw notFound("Proposal");
    }
    if (event.startAt.getTime() !== p.previousStartAt?.getTime()) {
      return this.end(
        p.id,
        new AppError(
          "The event's date changed since this was proposed. Ask your host to propose it again.",
          409,
          "PROPOSAL_STALE",
        ),
      );
    }
    if (!booking.totalAmount.equals(p.proposedPrice)) {
      return this.end(
        p.id,
        new AppError(
          "The price changed since this was proposed. Ask your host to propose it again.",
          409,
          "PROPOSAL_PRICE_CHANGED",
        ),
      );
    }
    try {
      this.checkDates(event, p.proposedStartAt, now);
    } catch (err) {
      if (err instanceof AppError) return this.end(p.id, err);
      throw err;
    }

    const range = { start: p.proposedStartAt, end: p.proposedEndAt };
    const shift = range.start.getTime() - event.startAt.getTime();
    const { moving } = await this.lines(event);
    const deadline = new Date(now.getTime() + CONFIRM_HOURS * HOUR);
    const reconfirm = moving.filter((l) => !l.partner);
    const idsOf = (k: ConflictKind) =>
      reconfirm.filter((l) => l.kind === k).map((l) => l.transactionId);

    try {
      await prisma.$transaction(async (tx) => {
        // Taken first, so two answers to the same proposal apply once.
        const claimed = await tx.eventEditProposal.updateMany({
          where: { id: p.id, status: "pending" },
          data: { status: "accepted", respondedAt: now },
        });
        if (claimed.count !== 1) {
          throw new AppError("This proposal was already answered", 409);
        }
        const others = await tx.eventEditProposal.count({
          where: {
            bookingId: p.bookingId,
            status: "pending",
            id: { not: p.id },
            expiresAt: { gte: now },
          },
        });
        if (others > 0) throw pendingError();
        // Checkout and other changes to this booking wait for this one.
        await tx.$executeRaw`SELECT id FROM bookings WHERE id = ${p.bookingId} FOR UPDATE`;
        await AvailabilitySvc.validateForCheckout(
          tx,
          p.bookingId,
          moving.map((l) => this.checkItem(event.id, l, range)),
        );
        await tx.event.update({
          where: { id: event.id },
          data: { startAt: range.start, endAt: range.end },
        });
        await tx.booking.update({
          where: { id: p.bookingId },
          data: {
            startAt: new Date(booking.startAt.getTime() + shift),
            endAt: new Date(booking.endAt.getTime() + shift),
            // The reminder is due again for the new date.
            reminderSentAt: null,
          },
        });
        const toConfirm = {
          status: "pending_provider_confirmation" as const,
          confirmationDeadline: deadline,
        };
        const live = { in: [...LIVE] };
        if (idsOf("asset").length) {
          await tx.eventAssetTransaction.updateMany({
            where: { id: { in: idsOf("asset") }, status: live },
            data: toConfirm,
          });
        }
        if (idsOf("service").length) {
          await tx.eventServiceTransaction.updateMany({
            where: { id: { in: idsOf("service") }, status: live },
            data: toConfirm,
          });
        }
        if (idsOf("venue").length) {
          await tx.eventVenueTransaction.updateMany({
            where: { id: { in: idsOf("venue") }, status: live },
            data: toConfirm,
          });
        }
      });
    } catch (err) {
      if (err instanceof AvailabilityConflictError) {
        const line = moving.find(
          (l) => l.kind === err.kind && l.listingId === err.itemId,
        );
        throw new AppError(
          `${line?.itemName ?? "A Supplier"} is no longer free on the new date. Your host can propose another one.`,
          409,
          "AVAILABILITY_CONFLICT",
        );
      }
      throw err;
    }

    await this.announceApplied(p.id, event, range, moving).catch((e) =>
      console.error(`Reschedule ${p.id} answer not announced`, e),
    );
    return {
      proposalId: p.id,
      eventId: event.id,
      startAt: range.start,
      endAt: range.end,
    };
  }

  private static async announceApplied(
    proposalId: string,
    event: EventRow,
    range: { start: Date; end: Date },
    moving: LiveLine[],
  ) {
    const reconfirming = moving.filter((l) => !l.partner);
    await NotificationSvc.create({
      userId: event.organizerId,
      type: "EVENT_EDIT_ACCEPTED",
      title: "Date change accepted",
      message:
        reconfirming.length > 0
          ? `The citizen accepted moving ${event.name} to ${when(range.start)}. ${names(reconfirming)} ${reconfirming.length === 1 ? "confirms" : "confirm"} the new date within ${CONFIRM_HOURS} hours.`
          : `The citizen accepted moving ${event.name} to ${when(range.start)}. Every Supplier is your partner, so it's booked.`,
      metadata: {
        link: eventLink(event.id),
        proposalId,
        proposalType: "reschedule",
      },
    });
    for (const l of moving) {
      await NotificationSvc.create(
        l.partner
          ? {
              userId: l.providerId,
              type: "EVENT_RESCHEDULED",
              title: "A booking moved to a new date",
              message: `${event.name} moved to ${when(range.start)}. You're partners, so ${l.itemName} stays booked.`,
              metadata: {
                transactionId: l.transactionId,
                kind: l.kind,
                eventId: event.id,
                link: providerRequestsLink(),
              },
            }
          : {
              userId: l.providerId,
              type: "EVENT_RESCHEDULE_REQUEST",
              title: "Confirm a new date",
              message: `${event.name} moved to ${when(range.start)}. Confirm or decline ${l.itemName} within ${CONFIRM_HOURS} hours.`,
              metadata: {
                transactionId: l.transactionId,
                kind: l.kind,
                eventId: event.id,
                link: providerRequestsLink(),
              },
            },
      );
    }
    announceToUser(event.clientId, "bookings");
    announceToUser(event.organizerId, "bookings");
  }
}

function pendingError() {
  return new AppError(
    "Another change to this booking is waiting for an answer.",
    409,
    "PROPOSAL_PENDING",
  );
}
