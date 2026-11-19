import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { AppError, notFound } from "../../utils/errors";
import NotificationSvc from "../notifications/user-notification.service";
import PricingSvc from "../pricing/pricing.service";
import { commissionPctOf, lineSnapshot } from "../pricing/event-breakdown";
import AvailabilitySvc from "../availability/availability.service";
import { AvailabilityConflictError } from "../availability/availability.types";
import EventConflictSvc, {
  eventLink,
  type ConflictKind,
} from "./event-conflict.service";

/**
 * Replacing a Supplier on a booked event (ADR 0010). The Event Foxer proposes
 * a listing of the same kind and category for a line that needs replacing;
 * nothing changes until the citizen accepts. On acceptance the new line is
 * added awaiting its Supplier's confirmation, like any item added to a
 * booking, and the old line is let go.
 *
 * Only an unpaid booking can be edited for now: checkout then charges the new
 * total by itself. A paid booking needs the price difference charged or
 * refunded, which is not built yet.
 */

/** How long the citizen has to answer a proposal. */
export const PROPOSAL_HOURS = 48;
/** How long the new Supplier has to confirm (as for any added item). */
const CONFIRM_HOURS = 24;
const LIVE = ["pending", "pending_provider_confirmation", "approved"];

export class EditAfterPaymentError extends AppError {
  constructor() {
    super(
      "This booking is already paid. Replacing a Supplier on a paid booking is not available yet.",
      409,
      "EDIT_AFTER_PAYMENT",
    );
  }
}

/** A listing that could replace a line, with what it would cost. */
export interface ReplacementCandidate {
  itemId: string;
  name: string;
  supplierName: string;
  category: string;
  /** The Supplier's price for the line (before the host's commission and fees). */
  price: Prisma.Decimal;
  /** A venue whose Mayor works with this Event Foxer; listed first. */
  partner: boolean;
}

interface LineRow {
  id: string;
  eventId: string;
  bookingId: string | null;
  status: string;
  quantity: number;
  /** The line's full charge as booked: the Supplier's price plus fees. */
  charge: Prisma.Decimal;
  listingId: string;
  category: string;
  name: string;
  event: {
    id: string;
    name: string;
    organizerId: string;
    clientId: string;
    startAt: Date;
    endAt: Date;
    commissionPct: Prisma.Decimal | null;
  };
}

const EVENT_FIELDS = {
  select: {
    id: true,
    name: true,
    organizerId: true,
    clientId: true,
    startAt: true,
    endAt: true,
    commissionPct: true,
  },
} as const;

const PRICED = {
  agreedPrice: true,
  commissionAmount: true,
  platformFeeAmount: true,
  processingFeeAmount: true,
} as const;

/** A line's full charge; takes stored Decimals or a fresh breakdown's numbers. */
const chargeOf = (r: {
  agreedPrice: Prisma.Decimal.Value;
  commissionAmount: Prisma.Decimal.Value | null;
  platformFeeAmount: Prisma.Decimal.Value | null;
  processingFeeAmount: Prisma.Decimal.Value | null;
}) =>
  new Prisma.Decimal(r.agreedPrice)
    .add(r.commissionAmount ?? 0)
    .add(r.platformFeeAmount ?? 0)
    .add(r.processingFeeAmount ?? 0);

/** Sentinel used to roll back an availability check that passed. */
class Probe extends Error {}

export default class EventEditSvc {
  /** The line being replaced, or 404 when it isn't the host's. */
  private static async line(
    kind: ConflictKind,
    id: string,
    hostId: string,
  ): Promise<LineRow> {
    let row: LineRow | null = null;
    if (kind === "asset") {
      const t = await prisma.eventAssetTransaction.findUnique({
        where: { id },
        select: {
          id: true,
          eventId: true,
          bookingId: true,
          status: true,
          quantity: true,
          ...PRICED,
          asset: { select: { id: true, category: true, name: true } },
          event: EVENT_FIELDS,
        },
      });
      if (t) {
        row = {
          ...t,
          charge: chargeOf(t),
          listingId: t.asset.id,
          category: t.asset.category,
          name: t.asset.name,
        };
      }
    } else if (kind === "service") {
      const t = await prisma.eventServiceTransaction.findUnique({
        where: { id },
        select: {
          id: true,
          eventId: true,
          bookingId: true,
          status: true,
          ...PRICED,
          service: { select: { id: true, category: true, name: true } },
          event: EVENT_FIELDS,
        },
      });
      if (t) {
        row = {
          ...t,
          quantity: 1,
          charge: chargeOf(t),
          listingId: t.service.id,
          category: t.service.category,
          name: t.service.name,
        };
      }
    } else {
      const t = await prisma.eventVenueTransaction.findUnique({
        where: { id },
        select: {
          id: true,
          eventId: true,
          bookingId: true,
          status: true,
          ...PRICED,
          venue: { select: { id: true, category: true, name: true } },
          event: EVENT_FIELDS,
        },
      });
      if (t) {
        row = {
          ...t,
          quantity: 1,
          charge: chargeOf(t),
          listingId: t.venue.id,
          category: t.venue.category,
          name: t.venue.name,
        };
      }
    }
    if (!row || row.event.organizerId !== hostId) throw notFound("Supplier");
    return row;
  }

  /** The prices a venue's Mayor agreed with this Event Foxer, by venue. */
  private static async partnerVenuePrices(hostId: string, venueIds: string[]) {
    if (venueIds.length === 0) return new Map<string, Prisma.Decimal>();
    const rows = await prisma.venueEventFoxerAffiliation.findMany({
      where: {
        eventFoxerId: hostId,
        venueId: { in: venueIds },
        status: "approved",
        permissions: { has: "template:attach" },
      },
      select: { venueId: true, agreedPrice: true },
    });
    return new Map(
      rows.map((r) => [r.venueId, r.agreedPrice ?? new Prisma.Decimal(-1)]),
    );
  }

  /**
   * Same-category listings of the same kind that are free for the event's
   * dates. The current listing is left out. Partners first, then by price.
   */
  static async replacements(
    hostId: string,
    kind: ConflictKind,
    transactionId: string,
  ): Promise<ReplacementCandidate[]> {
    const row = await this.line(kind, transactionId, hostId);
    const candidates = await this.listingsLike(kind, row, hostId);
    const free: ReplacementCandidate[] = [];
    for (const c of candidates) {
      if (await this.isFree(kind, c.itemId, row)) free.push(c);
    }
    return free;
  }

  private static async listingsLike(
    kind: ConflictKind,
    row: LineRow,
    hostId: string,
  ): Promise<ReplacementCandidate[]> {
    const take = 20;
    if (kind === "asset") {
      const rows = await prisma.asset.findMany({
        where: {
          category: row.category,
          status: "available",
          deletedAt: null,
          id: { not: row.listingId },
        },
        orderBy: { price: "asc" },
        take,
        select: {
          id: true,
          name: true,
          category: true,
          price: true,
          owner: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        itemId: r.id,
        name: r.name,
        supplierName: r.owner.name,
        category: r.category,
        price: r.price.mul(row.quantity || 1),
        partner: false,
      }));
    }
    if (kind === "service") {
      const rows = await prisma.service.findMany({
        where: {
          category: row.category as Prisma.EnumServiceCategoryFilter["equals"],
          status: "available",
          deletedAt: null,
          id: { not: row.listingId },
        },
        orderBy: { price: "asc" },
        take,
        select: {
          id: true,
          name: true,
          category: true,
          price: true,
          owner: { select: { name: true } },
        },
      });
      return rows.map((r) => ({
        itemId: r.id,
        name: r.name,
        supplierName: r.owner.name,
        category: r.category,
        price: r.price,
        partner: false,
      }));
    }
    const rows = await prisma.venue.findMany({
      where: {
        category: row.category,
        status: "available",
        id: { not: row.listingId },
      },
      orderBy: { price: "asc" },
      take,
      select: {
        id: true,
        name: true,
        category: true,
        price: true,
        mayor: { select: { name: true } },
      },
    });
    const agreed = await this.partnerVenuePrices(
      hostId,
      rows.map((r) => r.id),
    );
    return rows
      .map((r) => {
        const deal = agreed.get(r.id);
        return {
          itemId: r.id,
          name: r.name,
          supplierName: r.mayor.name,
          category: r.category,
          // The Mayor's agreed price for this Event Foxer replaces the
          // listing price, as it does when a template is priced.
          price: deal && deal.gte(0) ? deal : r.price,
          partner: deal !== undefined,
        };
      })
      .sort((a, b) =>
        a.partner === b.partner
          ? a.price.comparedTo(b.price)
          : a.partner
            ? -1
            : 1,
      );
  }

  /** Whether a listing could be reserved for the event, without reserving it. */
  private static async isFree(
    kind: ConflictKind,
    itemId: string,
    row: LineRow,
  ): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        await AvailabilitySvc.reserve(tx, [
          {
            kind,
            itemId,
            dateRange: { start: row.event.startAt, end: row.event.endAt },
            eventId: kind === "service" ? row.eventId : undefined,
            quantity: kind === "asset" ? row.quantity || 1 : undefined,
          },
        ]);
        throw new Probe();
      });
    } catch (err) {
      if (err instanceof Probe) return true;
      if (err instanceof AvailabilityConflictError) return false;
      throw err;
    }
    return true;
  }

  /** The replacement's price and how it is charged, from the server's rates. */
  private static async priceReplacement(
    kind: ConflictKind,
    row: LineRow,
    candidate: ReplacementCandidate,
  ) {
    if (row.event.commissionPct == null) {
      // An Event booked before per-line pricing: checkout prices the line.
      return {
        snapshot: { agreedPrice: candidate.price },
        charge: candidate.price,
      };
    }
    const quantity = kind === "asset" ? row.quantity || 1 : 1;
    const breakdown = await PricingSvc.calculateEventBreakdownForLines(
      [
        {
          kind,
          listingId: candidate.itemId,
          category: candidate.category,
          unitPrice: candidate.price.div(quantity),
          quantity,
        },
      ],
      commissionPctOf(row.event.commissionPct),
    );
    const snapshot = lineSnapshot(breakdown.lines[0]);
    return { snapshot, charge: chargeOf(snapshot) };
  }

  /**
   * The Event Foxer proposes a replacement for a line that needs one. The
   * citizen is told, and the proposal is posted to the event's chat with them.
   */
  static async propose(
    hostId: string,
    input: {
      kind: ConflictKind;
      transactionId: string;
      itemId: string;
      note?: string;
    },
    now: Date = new Date(),
  ) {
    const row = await this.line(input.kind, input.transactionId, hostId);

    const detail = await EventConflictSvc.eventDetail(hostId, row.eventId);
    const shown = detail.suppliers.find(
      (s) => s.transactionId === row.id && s.kind === input.kind,
    );
    if (!shown?.reason) {
      throw new AppError("This Supplier doesn't need replacing", 409);
    }
    if (shown.pendingProposalId) {
      throw new AppError("A replacement is already waiting for an answer", 409);
    }
    if (!row.bookingId) throw new AppError("This event has no booking", 409);
    const booking = await prisma.booking.findUnique({
      where: { id: row.bookingId },
      select: { id: true, userId: true, status: true },
    });
    if (!booking || booking.status === "cancelled") {
      throw new AppError("This booking is cancelled", 409);
    }
    if (booking.status !== "pending") throw new EditAfterPaymentError();

    const candidate = (await this.listingsLike(input.kind, row, hostId)).find(
      (c) => c.itemId === input.itemId,
    );
    if (!candidate) {
      throw new AppError(
        "Pick a listing of the same kind and category that is available",
        400,
      );
    }
    if (!(await this.isFree(input.kind, candidate.itemId, row))) {
      throw new AppError(
        "That listing is not free on the event's dates",
        409,
        "AVAILABILITY_CONFLICT",
      );
    }

    const { charge } = await this.priceReplacement(input.kind, row, candidate);
    let proposal;
    try {
      proposal = await prisma.eventEditProposal.create({
        data: {
          eventId: row.eventId,
          bookingId: booking.id,
          proposedById: hostId,
          kind: input.kind,
          replacesTransactionId: row.id,
          itemId: candidate.itemId,
          quantity: input.kind === "asset" ? row.quantity || 1 : 1,
          currentPrice: row.charge,
          proposedPrice: charge,
          priceDelta: charge.sub(row.charge),
          note: input.note?.trim() || null,
          expiresAt: new Date(now.getTime() + PROPOSAL_HOURS * 3_600_000),
        },
      });
    } catch (err) {
      // The partial unique index: another proposal for this line got there first.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new AppError(
          "A replacement is already waiting for an answer",
          409,
        );
      }
      throw err;
    }

    await this.tellCitizen(booking.userId, row, candidate, proposal).catch(
      (e) => console.error(`Proposal ${proposal.id} was not announced`, e),
    );
    return proposal;
  }

  private static async tellCitizen(
    citizenId: string,
    row: LineRow,
    candidate: ReplacementCandidate,
    proposal: { id: string; bookingId: string; proposedPrice: Prisma.Decimal },
  ) {
    const text = `${row.name} can't be part of ${row.event.name}. The host proposes ${candidate.name} instead. Open your booking to accept or decline.`;
    await NotificationSvc.create({
      userId: citizenId,
      type: "EVENT_EDIT_PROPOSED",
      title: "Your host proposes a replacement",
      message: text,
      metadata: {
        link: `/bookings/${proposal.bookingId}`,
        bookingId: proposal.bookingId,
        proposalId: proposal.id,
      },
    });
    // The event's chat with the citizen (the Shared Inbox, ADR 0005), so the
    // two can talk it over. The answer itself is given on the proposal.
    const { default: ConversationService } =
      await import("../conversations/conversation.service");
    const thread = (await ConversationService.startInboxConversation(
      row.event.organizerId,
      { eventId: row.eventId, guestId: citizenId },
    )) as { id: string };
    await ConversationService.sendMessage({
      conversationId: thread.id,
      senderId: row.event.organizerId,
      content: text,
    });
  }

  /** A booking's proposals, for its citizen or its host; newest first. */
  static async forBooking(
    userId: string,
    bookingId: string,
    now: Date = new Date(),
  ) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true, event: { select: { organizerId: true } } },
    });
    if (
      !booking ||
      (booking.userId !== userId && booking.event?.organizerId !== userId)
    ) {
      throw notFound("Booking");
    }
    await this.expireOld(bookingId, now);
    const rows = await prisma.eventEditProposal.findMany({
      where: { bookingId },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(rows.map((p) => this.describe(p)));
  }

  /** Lazily expires a booking's overdue proposals, as edit requests do (0003). */
  private static async expireOld(bookingId: string, now: Date) {
    await prisma.eventEditProposal.updateMany({
      where: { bookingId, status: "pending", expiresAt: { lt: now } },
      data: { status: "expired" },
    });
  }

  /** A proposal with the names of the old and new listings. */
  private static async describe(p: {
    id: string;
    kind: string;
    itemId: string;
    replacesTransactionId: string;
    [k: string]: unknown;
  }) {
    const name = async (kind: string, listingId: string) => {
      if (kind === "asset") {
        return (
          await prisma.asset.findUnique({
            where: { id: listingId },
            select: { name: true },
          })
        )?.name;
      }
      if (kind === "service") {
        return (
          await prisma.service.findUnique({
            where: { id: listingId },
            select: { name: true },
          })
        )?.name;
      }
      return (
        await prisma.venue.findUnique({
          where: { id: listingId },
          select: { name: true },
        })
      )?.name;
    };
    const replacedListing =
      p.kind === "asset"
        ? (
            await prisma.eventAssetTransaction.findUnique({
              where: { id: p.replacesTransactionId },
              select: { assetId: true },
            })
          )?.assetId
        : p.kind === "service"
          ? (
              await prisma.eventServiceTransaction.findUnique({
                where: { id: p.replacesTransactionId },
                select: { serviceId: true },
              })
            )?.serviceId
          : (
              await prisma.eventVenueTransaction.findUnique({
                where: { id: p.replacesTransactionId },
                select: { venueId: true },
              })
            )?.venueId;
    return {
      ...p,
      itemName: (await name(p.kind, p.itemId)) ?? "",
      replacesName: replacedListing
        ? ((await name(p.kind, replacedListing)) ?? "")
        : "",
    };
  }

  /** The citizen's answer, after the checks both answers share. */
  private static async openFor(
    citizenId: string,
    proposalId: string,
    now: Date,
  ) {
    const p = await prisma.eventEditProposal.findUnique({
      where: { id: proposalId },
      include: {
        booking: { select: { userId: true, status: true } },
        event: { select: { name: true, organizerId: true } },
      },
    });
    if (!p || p.booking.userId !== citizenId) throw notFound("Proposal");
    if (p.status === "pending" && p.expiresAt < now) {
      await prisma.eventEditProposal.updateMany({
        where: { id: p.id, status: "pending" },
        data: { status: "expired" },
      });
      throw new AppError("This proposal has expired", 409);
    }
    if (p.status !== "pending") {
      throw new AppError(`This proposal was already ${p.status}`, 409);
    }
    return p;
  }

  /**
   * The citizen accepts: the new line is added awaiting its Supplier, the old
   * one is let go, and checkout charges the new total once it is confirmed.
   */
  static async accept(
    citizenId: string,
    proposalId: string,
    now: Date = new Date(),
  ) {
    const p = await this.openFor(citizenId, proposalId, now);
    if (p.booking.status !== "pending") throw new EditAfterPaymentError();
    const kind = p.kind as ConflictKind;
    const row = await this.line(kind, p.replacesTransactionId, p.proposedById);
    const candidate = (await this.listingsLike(kind, row, p.proposedById)).find(
      (c) => c.itemId === p.itemId,
    );
    if (!candidate) {
      throw new AppError("That listing is no longer available", 409);
    }
    const { snapshot, charge } = await this.priceReplacement(
      kind,
      row,
      candidate,
    );
    // The citizen agreed to the price they were shown. If the listing's price
    // has moved since, this proposal ends and the host proposes it again.
    if (!charge.equals(p.proposedPrice)) {
      await prisma.eventEditProposal.updateMany({
        where: { id: p.id, status: "pending" },
        data: { status: "expired" },
      });
      throw new AppError(
        "The price changed since this was proposed. Ask your host to propose it again.",
        409,
        "PROPOSAL_PRICE_CHANGED",
      );
    }
    const confirmationDeadline = new Date(
      now.getTime() + CONFIRM_HOURS * 3_600_000,
    );
    const base = {
      eventId: row.eventId,
      bookingId: p.bookingId,
      ...snapshot,
      status: "pending_provider_confirmation" as const,
      confirmationDeadline,
      included: true,
    };

    let created: { id: string; providerId: string };
    try {
      created = await prisma.$transaction(async (tx) => {
        // Taken first, so two answers to the same proposal apply once.
        const claimed = await tx.eventEditProposal.updateMany({
          where: { id: p.id, status: "pending" },
          data: { status: "accepted", respondedAt: now },
        });
        if (claimed.count !== 1) {
          throw new AppError("This proposal was already answered", 409);
        }
        await AvailabilitySvc.reserve(tx, [
          {
            kind,
            itemId: p.itemId,
            dateRange: { start: row.event.startAt, end: row.event.endAt },
            eventId: kind === "service" ? row.eventId : undefined,
            quantity: kind === "asset" ? p.quantity : undefined,
          },
        ]);

        let line: { id: string; providerId: string };
        if (kind === "asset") {
          const asset = await tx.asset.findUniqueOrThrow({
            where: { id: p.itemId },
            select: { ownerId: true, currency: true },
          });
          line = await tx.eventAssetTransaction.create({
            data: {
              ...base,
              assetId: p.itemId,
              providerId: asset.ownerId,
              quantity: p.quantity,
              currency: asset.currency,
            },
            select: { id: true, providerId: true },
          });
          if (LIVE.includes(row.status)) {
            await tx.eventAssetTransaction.update({
              where: { id: row.id },
              data: { status: "cancelled" },
            });
          }
        } else if (kind === "service") {
          const service = await tx.service.findUniqueOrThrow({
            where: { id: p.itemId },
            select: { ownerId: true, currency: true },
          });
          line = await tx.eventServiceTransaction.create({
            data: {
              ...base,
              serviceId: p.itemId,
              providerId: service.ownerId,
              currency: service.currency,
            },
            select: { id: true, providerId: true },
          });
          if (LIVE.includes(row.status)) {
            await tx.eventServiceTransaction.update({
              where: { id: row.id },
              data: { status: "cancelled" },
            });
          }
        } else {
          const venue = await tx.venue.findUniqueOrThrow({
            where: { id: p.itemId },
            select: { mayorId: true },
          });
          line = await tx.eventVenueTransaction.create({
            data: { ...base, venueId: p.itemId, providerId: venue.mayorId },
            select: { id: true, providerId: true },
          });
          if (LIVE.includes(row.status)) {
            await tx.eventVenueTransaction.update({
              where: { id: row.id },
              data: { status: "cancelled" },
            });
          }
        }
        await tx.eventEditProposal.update({
          where: { id: p.id },
          data: { appliedTransactionId: line.id },
        });
        return line;
      });
    } catch (err) {
      if (err instanceof AvailabilityConflictError) {
        throw new AppError(
          "That listing is no longer free on the event's dates",
          409,
          "AVAILABILITY_CONFLICT",
        );
      }
      throw err;
    }

    await Promise.all([
      NotificationSvc.create({
        userId: p.event.organizerId,
        type: "EVENT_EDIT_ACCEPTED",
        title: "Replacement accepted",
        message: `The citizen accepted ${candidate.name} for ${p.event.name}. It is waiting for its Supplier to confirm.`,
        metadata: { link: eventLink(p.eventId), proposalId: p.id },
      }),
      NotificationSvc.create({
        userId: created.providerId,
        type: "EVENT_EDIT_REQUEST",
        title: "A new event request",
        message: `${p.event.name} would like ${candidate.name}. Confirm or decline within ${CONFIRM_HOURS} hours.`,
        metadata: { transactionId: created.id, kind },
      }),
    ]).catch((e) => console.error(`Proposal ${p.id} answer not announced`, e));

    return { proposalId: p.id, transactionId: created.id };
  }

  /** The citizen declines; the line still needs replacing. */
  static async decline(
    citizenId: string,
    proposalId: string,
    now: Date = new Date(),
  ) {
    const p = await this.openFor(citizenId, proposalId, now);
    const claimed = await prisma.eventEditProposal.updateMany({
      where: { id: p.id, status: "pending" },
      data: { status: "declined", respondedAt: now },
    });
    if (claimed.count !== 1) {
      throw new AppError("This proposal was already answered", 409);
    }
    await NotificationSvc.create({
      userId: p.event.organizerId,
      type: "EVENT_EDIT_DECLINED",
      title: "Replacement declined",
      message: `The citizen declined your replacement for ${p.event.name}. You can propose another.`,
      metadata: { link: eventLink(p.eventId), proposalId: p.id },
    }).catch((e) => console.error(`Proposal ${p.id} decline not announced`, e));
    return { proposalId: p.id, status: "declined" as const };
  }

  /** The host takes back a proposal the citizen hasn't answered. */
  static async withdraw(hostId: string, proposalId: string) {
    const p = await prisma.eventEditProposal.findUnique({
      where: { id: proposalId },
      select: { id: true, proposedById: true },
    });
    if (!p || p.proposedById !== hostId) throw notFound("Proposal");
    const claimed = await prisma.eventEditProposal.updateMany({
      where: { id: p.id, status: "pending" },
      data: { status: "withdrawn", respondedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new AppError(
        "Only a proposal waiting for an answer can be withdrawn",
        409,
      );
    }
    return { proposalId: p.id, status: "withdrawn" as const };
  }
}
