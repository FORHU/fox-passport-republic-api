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
   */
  static async getCounters(userId: string): Promise<MilestoneCounters> {
    const [bookedEvents, stamps] = await Promise.all([
      prisma.booking.count({
        where: { userId, status: { in: PAID_BOOKING_STATUSES } },
      }),
      prisma.passportStamp.findMany({
        where: { passport: { userId } },
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
        where: { userId, bookingId: { in: attendedBookingIds } },
      }),
      prisma.booking.aggregate({
        where: { id: { in: attendedBookingIds } },
        _sum: { totalAmount: true },
      }),
      prisma.refund.aggregate({
        where: {
          bookingId: { in: attendedBookingIds },
          status: RefundStatus.succeeded,
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
