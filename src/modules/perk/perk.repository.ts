import { RewardLifecycleType } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import {
  PerkIssuer,
  PerkRedemptionStatus,
  USABLE_BOOKING_STATUSES,
} from "./perk.constants";

/** Thrown inside a redeem transaction; the service turns each into a 4xx. */
export class PerkRedeemError extends Error {
  constructor(public readonly reason: "sold_out" | "insufficient" | "already") {
    super(reason);
  }
}

/** The ledger line for each way Tokens come back, ending in the perk's code. */
const RETURN_REASON = {
  expired: (code: string) =>
    `PERK_EXPIRED: Tokens returned for unused perk (${code})`,
  booking_cancelled: (code: string) =>
    `PERK_BOOKING_CANCELLED: Tokens returned for perk (${code})`,
  perk_removed: (code: string) =>
    `PERK_REMOVED: Tokens returned, the perk was taken down (${code})`,
} as const;

export default class PerkRepo {
  /**
   * What a citizen can buy: venue and host perks that are on and in stock,
   * optionally only the ones for one event.
   */
  static async listOffered(eventId?: string) {
    return prisma.perk.findMany({
      where: {
        active: true,
        issuerType: { in: [PerkIssuer.venue, PerkIssuer.host] },
        OR: [{ remaining: null }, { remaining: { gt: 0 } }],
        ...(eventId ? { eventId } : {}),
      },
      orderBy: [{ tokenCost: "asc" }, { createdAt: "desc" }],
    });
  }

  /** The event a host would offer a perk on. */
  static async findEventForOffer(eventId: string) {
    return prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, organizerId: true, endAt: true },
    });
  }

  /** The venue a Mayor would offer a perk at. */
  static async findVenueForOffer(venueId: string) {
    return prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, name: true, mayorId: true },
    });
  }

  static async createPerk(data: {
    issuerType: string;
    issuerUserId: string;
    venueId: string | null;
    eventId: string | null;
    title: string;
    description: string | null;
    worthPhp: number;
    tokenCost: number;
    quantity: number;
  }) {
    return prisma.perk.create({
      data: { ...data, remaining: data.quantity },
    });
  }

  /** The perks a person offers, newest first, with how many were bought. */
  static async listIssued(userId: string) {
    return prisma.perk.findMany({
      where: { issuerUserId: userId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { redemptions: true } } },
    });
  }

  /** Switches an offer off once; false when it was already off. */
  static async deactivate(perkId: string): Promise<boolean> {
    const done = await prisma.perk.updateMany({
      where: { id: perkId, active: true },
      data: { active: false },
    });
    return done.count > 0;
  }

  /** Everyone still holding this perk unused. */
  static async findReadyForPerk(perkId: string) {
    return prisma.perkRedemption.findMany({
      where: { perkId, status: PerkRedemptionStatus.ready },
      select: { id: true, userId: true, tokensSpent: true, code: true },
    });
  }

  /** A redemption by its typed code, with what a check shows. */
  static async findByCode(code: string) {
    return prisma.perkRedemption.findUnique({
      where: { code },
      include: {
        perk: true,
        user: { select: { name: true } },
      },
    });
  }

  static async findBookingForCheck(bookingId: string) {
    return prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        eventId: true,
        startAt: true,
        event: { select: { name: true } },
      },
    });
  }

  static async findVenueName(venueId: string) {
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { name: true },
    });
    return venue?.name ?? null;
  }

  /**
   * Marks a ready perk used, once. The claim is a guarded write on a perk
   * that is ready and not past its date, so two scans, or two staff, cannot
   * both succeed.
   */
  static async markUsed(
    redemptionId: string,
    scannerId: string,
    now: Date,
  ): Promise<boolean> {
    const done = await prisma.perkRedemption.updateMany({
      where: {
        id: redemptionId,
        status: PerkRedemptionStatus.ready,
        expiresAt: { gt: now },
      },
      data: {
        status: PerkRedemptionStatus.used,
        usedAt: now,
        usedByUserId: scannerId,
      },
    });
    return done.count > 0;
  }

  static async findPerk(id: string) {
    return prisma.perk.findUnique({ where: { id } });
  }

  /**
   * The person's bookings a perk can be used on: still ahead of them (not
   * cancelled or over), and at the perk's venue, or booked from the perk's
   * event package (each booking of a package is its own Event row, so the
   * package is what ties them together).
   */
  static async findEligibleBookings(
    userId: string,
    perk: { venueId: string | null; templateId: string | null },
    now: Date,
  ) {
    return prisma.booking.findMany({
      where: {
        userId,
        status: { in: [...USABLE_BOOKING_STATUSES] },
        endAt: { gt: now },
        event: {
          ...(perk.templateId ? { templateId: perk.templateId } : {}),
          ...(perk.venueId
            ? {
                venueTransactions: {
                  some: {
                    venueId: perk.venueId,
                    status: { notIn: ["rejected", "cancelled"] },
                  },
                },
              }
            : {}),
        },
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
        event: { select: { name: true } },
      },
      orderBy: { startAt: "asc" },
    });
  }

  static async findBookingOf(userId: string, bookingId: string) {
    return prisma.booking.findFirst({
      where: { id: bookingId, userId },
      select: { id: true, eventId: true, status: true, endAt: true },
    });
  }

  /** Perk ids this person already holds for these bookings (ready or used). */
  static async findHeld(userId: string) {
    return prisma.perkRedemption.findMany({
      where: {
        userId,
        status: {
          in: [PerkRedemptionStatus.ready, PerkRedemptionStatus.used],
        },
      },
      select: { perkId: true, bookingId: true },
    });
  }

  static async listMine(userId: string) {
    return prisma.perkRedemption.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { perk: { select: { title: true, venueId: true } } },
    });
  }

  static async findRedemption(id: string) {
    return prisma.perkRedemption.findUnique({
      where: { id },
      include: { perk: true },
    });
  }

  /**
   * Spends the Tokens and issues the code in one transaction: the stock, the
   * balance and the "once per booking" rule are each claimed with a guarded
   * write, so two taps or two phones cannot oversell a perk or spend Tokens a
   * person does not have.
   */
  static async redeemTransaction(data: {
    userId: string;
    perk: {
      id: string;
      title: string;
      tokenCost: number;
      quantity: number | null;
    };
    bookingId: string;
    code: string;
    secret: string;
    expiresAt: Date;
  }) {
    return prisma.$transaction(async (tx) => {
      const twice = await tx.perkRedemption.findFirst({
        where: {
          userId: data.userId,
          perkId: data.perk.id,
          bookingId: data.bookingId,
          status: {
            in: [PerkRedemptionStatus.ready, PerkRedemptionStatus.used],
          },
        },
        select: { id: true },
      });
      if (twice) throw new PerkRedeemError("already");

      if (data.perk.quantity !== null) {
        const stock = await tx.perk.updateMany({
          where: { id: data.perk.id, active: true, remaining: { gt: 0 } },
          data: { remaining: { decrement: 1 } },
        });
        if (stock.count === 0) throw new PerkRedeemError("sold_out");
      }

      const spent = await tx.passport.updateMany({
        where: { userId: data.userId, coins: { gte: data.perk.tokenCost } },
        data: { coins: { decrement: data.perk.tokenCost } },
      });
      if (spent.count === 0) throw new PerkRedeemError("insufficient");

      const passport = await tx.passport.findUnique({
        where: { userId: data.userId },
        select: { coins: true },
      });

      const redemption = await tx.perkRedemption.create({
        data: {
          userId: data.userId,
          perkId: data.perk.id,
          bookingId: data.bookingId,
          tokensSpent: data.perk.tokenCost,
          code: data.code,
          codeSecret: data.secret,
          status: PerkRedemptionStatus.ready,
          expiresAt: data.expiresAt,
        },
      });

      // Same ledger row a Token voucher writes; it needs a grant to hang on.
      const latestGrant = await tx.rewardEvent.findFirst({
        where: { userId: data.userId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (latestGrant) {
        await tx.rewardLifecycle.create({
          data: {
            grantEventId: latestGrant.id,
            userId: data.userId,
            type: RewardLifecycleType.REDEMPTION,
            coinsDelta: -data.perk.tokenCost,
            reason: `Redeemed perk ${data.perk.title} (${data.code})`,
          },
        });
      }

      return { redemption, remainingCoins: passport?.coins ?? 0 };
    });
  }

  /** Ready redemptions to look at for a return, oldest first. */
  static async findReady(take = 500) {
    return prisma.perkRedemption.findMany({
      where: { status: PerkRedemptionStatus.ready },
      select: {
        id: true,
        userId: true,
        bookingId: true,
        tokensSpent: true,
        code: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "asc" },
      take,
    });
  }

  /** The ids, among these, whose booking was cancelled. */
  static async findCancelledBookingIds(bookingIds: string[]) {
    if (bookingIds.length === 0) return new Set<string>();
    const rows = await prisma.booking.findMany({
      where: { id: { in: bookingIds }, status: "cancelled" },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Gives a ready perk's Tokens back, once. Claiming it (ready to returned)
   * and the credit happen in one transaction, so a re-run or a parallel run
   * pays nothing more. The original REDEMPTION row is not changed.
   */
  static async returnRedemption(data: {
    redemptionId: string;
    userId: string;
    tokens: number;
    code: string;
    why: "expired" | "booking_cancelled" | "perk_removed";
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const claimed = await tx.perkRedemption.updateMany({
        where: {
          id: data.redemptionId,
          status: PerkRedemptionStatus.ready,
        },
        data: { status: PerkRedemptionStatus.returned },
      });
      if (claimed.count === 0) return false;

      const original = await tx.rewardLifecycle.findFirst({
        where: {
          userId: data.userId,
          type: RewardLifecycleType.REDEMPTION,
          reason: { endsWith: `(${data.code})` },
        },
        select: { id: true, grantEventId: true },
      });
      const grantEventId =
        original?.grantEventId ??
        (
          await tx.rewardEvent.findFirst({
            where: { userId: data.userId },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          })
        )?.id;
      if (grantEventId) {
        await tx.rewardLifecycle.create({
          data: {
            grantEventId,
            userId: data.userId,
            type: RewardLifecycleType.VOUCHER_RETURN,
            coinsDelta: data.tokens,
            reversalOf: original?.id ?? null,
            reason: RETURN_REASON[data.why](data.code),
          },
        });
      }
      await tx.passport.update({
        where: { userId: data.userId },
        data: { coins: { increment: data.tokens } },
      });
      return true;
    });
  }
}
