import { BookingStatus, Prisma, ReferralStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";

/** Letters and digits that cannot be misread: no 0, O, 1, I or L. */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 8;

/** Bookings whose payment is confirmed and that were not cancelled. */
const PAID_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.confirmed,
  BookingStatus.active,
  BookingStatus.completed,
];

export class ReferralRepo {
  static async findCodeOf(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    return user?.referralCode ?? null;
  }

  /**
   * Gives the account this code if it has none. False when it already had one
   * (a second request got there first); a code another account holds raises
   * Prisma's unique violation, and the caller tries a new one.
   */
  static async setCodeIfEmpty(userId: string, code: string): Promise<boolean> {
    const { count } = await prisma.user.updateMany({
      where: { id: userId, referralCode: null },
      data: { referralCode: code },
    });
    return count === 1;
  }

  /** Whose code this is, or null. */
  static async findOwnerOfCode(code: string): Promise<{ id: string } | null> {
    return prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
  }

  static async findReferralOf(referredId: string) {
    return prisma.referral.findUnique({
      where: { referredId },
      select: { id: true, referrerId: true, status: true },
    });
  }

  static async create(data: {
    referrerId: string;
    referredId: string;
    code: string;
  }) {
    return prisma.referral.create({ data });
  }

  /** How many friends attached this person's code, and how many have paid out. */
  static async countFor(
    referrerId: string,
  ): Promise<{ referred: number; rewarded: number }> {
    const [referred, rewarded] = await Promise.all([
      prisma.referral.count({ where: { referrerId } }),
      prisma.referral.count({
        where: { referrerId, status: ReferralStatus.rewarded },
      }),
    ]);
    return { referred, rewarded };
  }

  static async hasPaidBooking(userId: string): Promise<boolean> {
    const found = await prisma.booking.findFirst({
      where: { userId, status: { in: PAID_BOOKING_STATUSES } },
      select: { id: true },
    });
    return found !== null;
  }
}

export function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
  );
}

export default ReferralRepo;
