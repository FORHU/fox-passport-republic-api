import { BookingStatus, RefundStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";

/** Bookings whose payment is confirmed and that were not cancelled. */
export const PAID_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.confirmed,
  BookingStatus.active,
  BookingStatus.completed,
];

export interface MilestoneCounters {
  bookedEvents: number;
  attendedEvents: number;
  distinctCities: number;
  distinctVenues: number;
  reviews: number;
  /** Whole pesos paid on attended bookings, minus successful refunds. */
  spendPhp: number;
}

export class MilestoneRepo {
  /** Active milestones with their tiers, in display order. */
  static async listActiveMilestones() {
    return prisma.milestone.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { tiers: { orderBy: { tier: "asc" } } },
    });
  }

  /** Active challenges, in display order. */
  static async listActiveChallenges() {
    return prisma.challenge.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  /**
   * Everything a citizen's milestones count. "Attended" is a passport stamp,
   * which is written on check-in. Reading never changes anything.
   *
   * With `before`, counts only what existed before that instant: the baseline
   * that tier Tokens are measured from (see MILESTONES_LAUNCH_AT).
   */
  static async getCounters(
    userId: string,
    before?: Date,
  ): Promise<MilestoneCounters> {
    const earlier = before ? { createdAt: { lt: before } } : {};
    const [bookedEvents, stamps] = await Promise.all([
      prisma.booking.count({
        where: { userId, status: { in: PAID_BOOKING_STATUSES }, ...earlier },
      }),
      prisma.passportStamp.findMany({
        where: { passport: { userId }, ...earlier },
        select: {
          bookingId: true,
          venueId: true,
          venue: { select: { city: true } },
        },
      }),
    ]);

    const attendedBookingIds = stamps.map((s) => s.bookingId);
    const distinctVenues = new Set(stamps.map((s) => s.venueId).filter(Boolean))
      .size;
    const distinctCities = new Set(
      stamps.map((s) => s.venue?.city).filter(Boolean),
    ).size;

    if (attendedBookingIds.length === 0) {
      return {
        bookedEvents,
        attendedEvents: 0,
        distinctCities,
        distinctVenues,
        reviews: 0,
        spendPhp: 0,
      };
    }

    const [reviews, paid, refunded] = await Promise.all([
      prisma.review.count({
        where: { userId, bookingId: { in: attendedBookingIds }, ...earlier },
      }),
      prisma.booking.aggregate({
        where: { id: { in: attendedBookingIds } },
        _sum: { totalAmount: true },
      }),
      prisma.refund.aggregate({
        where: {
          bookingId: { in: attendedBookingIds },
          status: RefundStatus.succeeded,
          ...earlier,
        },
        _sum: { amount: true },
      }),
    ]);

    const net =
      Number(paid._sum.totalAmount ?? 0) - Number(refunded._sum.amount ?? 0);

    return {
      bookedEvents,
      attendedEvents: attendedBookingIds.length,
      distinctCities,
      distinctVenues,
      reviews,
      spendPhp: Math.max(0, Math.floor(net)),
    };
  }

  /**
   * The citizen's paid bookings, oldest first, each with whether it was
   * attended (it has a passport stamp). The first N of these are the bookings
   * behind a "booked events" tier with target N.
   */
  static async listPaidBookings(
    userId: string,
  ): Promise<{ id: string; attended: boolean }[]> {
    const rows = await prisma.booking.findMany({
      where: { userId, status: { in: PAID_BOOKING_STATUSES } },
      select: { id: true, stamp: { select: { id: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, attended: r.stamp !== null }));
  }

  /**
   * The citizen's paid bookings created in [from, to), oldest first, each with
   * whether it was attended. The first N are the bookings behind a challenge
   * with target N.
   */
  static async listBookingsInWindow(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<{ id: string; attended: boolean }[]> {
    const rows = await prisma.booking.findMany({
      where: {
        userId,
        status: { in: PAID_BOOKING_STATUSES },
        createdAt: { gte: from, lt: to },
      },
      select: { id: true, stamp: { select: { id: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, attended: r.stamp !== null }));
  }

  /** The tiers this citizen has been paid Tokens for, as "milestoneKey:tier". */
  static async listPaidTierRefs(userId: string): Promise<string[]> {
    return this.listPaidRefs(userId, "milestone_tier");
  }

  /** The challenge periods paid, as "challengeKey:periodStartISO". */
  static async listPaidChallengeRefs(userId: string): Promise<string[]> {
    return this.listPaidRefs(userId, "challenge_period");
  }

  private static async listPaidRefs(
    userId: string,
    action: string,
  ): Promise<string[]> {
    const events = await prisma.rewardEvent.findMany({
      where: { userId, action, coins: { gt: 0 } },
      select: { refId: true },
    });
    return events.map((e) => e.refId);
  }

  /**
   * Citizens whose milestone counts may have moved since [since]: a new stamp
   * or review, or a refund that changed. The nightly sweep reconciles these, so
   * a hook that was missed never loses a reward or keeps one that was refunded.
   */
  static async listUsersToReconcile(since: Date): Promise<string[]> {
    const [stamps, reviews, refunds] = await Promise.all([
      prisma.passportStamp.findMany({
        where: { createdAt: { gte: since } },
        select: { passport: { select: { userId: true } } },
      }),
      prisma.review.findMany({
        where: { createdAt: { gte: since } },
        select: { userId: true },
      }),
      prisma.refund.findMany({
        where: {
          updatedAt: { gte: since },
          status: RefundStatus.succeeded,
          booking: { isNot: null },
        },
        select: { booking: { select: { userId: true } } },
      }),
    ]);
    const ids = new Set<string>();
    for (const s of stamps) ids.add(s.passport.userId);
    for (const r of reviews) if (r.userId) ids.add(r.userId);
    for (const r of refunds) if (r.booking) ids.add(r.booking.userId);
    return [...ids];
  }

  /** Qualifying bookings created in [from, to). */
  static async countQualifyingBookings(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return prisma.booking.count({
      where: {
        userId,
        status: { in: PAID_BOOKING_STATUSES },
        createdAt: { gte: from, lt: to },
      },
    });
  }
}

export default MilestoneRepo;
