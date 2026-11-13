import { prisma } from "../../utils/prisma";

export const DAILY_LOGIN_ACTION = "daily_login";

/**
 * Reads for daily login. Every claim is one RewardEvent whose `refId` is the
 * Manila day it was for (YYYY-MM-DD), so these read the reward ledger and need
 * no table of their own.
 */
export class DailyLoginRepo {
  static async getEmailVerified(userId: string): Promise<boolean | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isEmailVerified: true },
    });
    return user ? user.isEmailVerified : null;
  }

  /** The Manila days this person has claimed, newest first. */
  static async listClaimedDays(userId: string, take = 60): Promise<string[]> {
    const events = await prisma.rewardEvent.findMany({
      where: { userId, action: DAILY_LOGIN_ACTION, coins: { gt: 0 } },
      select: { refId: true },
      orderBy: { createdAt: "desc" },
      take,
    });
    return events.map((e) => e.refId);
  }

  /**
   * Whether this person has had a paid booking attended since [since]: an
   * `attend_event` grant that paid Tokens, which only a booking with a platform
   * fee can (the same test as RewardRepo.hasPaidAttendance, for one month).
   */
  static async hasPaidAttendanceSince(
    userId: string,
    since: Date,
  ): Promise<boolean> {
    const found = await prisma.rewardEvent.findFirst({
      where: {
        userId,
        action: "attend_event",
        coins: { gt: 0 },
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    return !!found;
  }

  /** Tokens daily login has paid this person since [since]. */
  static async sumCoinsSince(userId: string, since: Date): Promise<number> {
    const agg = await prisma.rewardEvent.aggregate({
      where: {
        userId,
        action: DAILY_LOGIN_ACTION,
        createdAt: { gte: since },
      },
      _sum: { coins: true },
    });
    return agg._sum.coins ?? 0;
  }
}

export default DailyLoginRepo;
