import { AppError } from "../../utils/errors";
import {
  DAILY_LOGIN_DAY7_BONUS_TOKENS,
  DAILY_LOGIN_MONTHLY_CAP_TOKENS,
} from "../../config";
import RewardRepo from "../reward/reward.repository";
import RewardService from "../reward/reward.service";
import DailyLoginRepo, { DAILY_LOGIN_ACTION } from "./daily-login.repository";
import { DailyLoginClaim, DailyLoginStatus } from "./daily-login.types";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8, no daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Manila calendar day of an instant, as YYYY-MM-DD. */
export function manilaDay(at: Date): string {
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The day before a YYYY-MM-DD day. */
export function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The instant the Manila month of [at] began. */
export function manilaMonthStart(at: Date): Date {
  const m = new Date(at.getTime() + MANILA_OFFSET_MS);
  return new Date(
    Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), 1) - MANILA_OFFSET_MS,
  );
}

/** The instant the next Manila day begins. */
export function nextManilaMidnight(at: Date): Date {
  const m = new Date(at.getTime() + MANILA_OFFSET_MS);
  return new Date(
    Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate() + 1) -
      MANILA_OFFSET_MS,
  );
}

/**
 * Days in a row claimed: counted back from today when today is claimed, else
 * from yesterday, so a streak is not lost until a whole day has been missed.
 */
export function streakOf(claimed: ReadonlySet<string>, today: string): number {
  let cursor = claimed.has(today) ? today : dayBefore(today);
  let streak = 0;
  while (claimed.has(cursor)) {
    streak++;
    cursor = dayBefore(cursor);
  }
  return streak;
}

export const CYCLE_LENGTH = 7;

/**
 * Which day of the 7-day cycle today is: the day being claimed, or, once it is
 * claimed, the day that was. A missed day starts the streak, and the cycle,
 * over at day 1.
 */
export function cycleDayOf(streak: number, claimedToday: boolean): number {
  return claimedToday
    ? ((streak - 1) % CYCLE_LENGTH) + 1
    : (streak % CYCLE_LENGTH) + 1;
}

/** What each of the seven days pays: [base x 6, base plus the day 7 bonus]. */
export function cycleAmounts(base: number, day7Bonus: number): number[] {
  return Array.from({ length: CYCLE_LENGTH }, (_, i) =>
    i === CYCLE_LENGTH - 1 ? base + day7Bonus : base,
  );
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

export default class DailyLoginSvc {
  /** Where this person stands today: claimed, claimable, why not, the streak. */
  static async getStatus(
    userId: string,
    now: Date = new Date(),
  ): Promise<DailyLoginStatus> {
    const emailVerified = await DailyLoginRepo.getEmailVerified(userId);
    if (emailVerified === null) throw new AppError("User not found", 404);

    const [rule, days, monthlyEarned] = await Promise.all([
      RewardRepo.findRuleByAction(DAILY_LOGIN_ACTION),
      DailyLoginRepo.listClaimedDays(userId),
      DailyLoginRepo.sumCoinsSince(userId, manilaMonthStart(now)),
    ]);

    const today = manilaDay(now);
    const claimed = new Set(days);
    const claimedToday = claimed.has(today);
    const base = rule?.active ? rule.coins : 0;
    const streak = streakOf(claimed, today);
    const cycleDay = cycleDayOf(streak, claimedToday);
    const cycle = cycleAmounts(
      base,
      base > 0 ? DAILY_LOGIN_DAY7_BONUS_TOKENS : 0,
    );

    let reason: DailyLoginStatus["reason"] = null;
    if (base <= 0) reason = "inactive";
    else if (!emailVerified) reason = "email_not_verified";
    else if (monthlyEarned >= DAILY_LOGIN_MONTHLY_CAP_TOKENS)
      reason = "cap_reached";

    return {
      claimedToday,
      canClaim: !claimedToday && reason === null,
      reason,
      amount: cycle[cycleDay - 1],
      nextAmount: cycle[cycleDay % CYCLE_LENGTH],
      streak,
      cycleDay,
      cycle,
      monthlyCap: DAILY_LOGIN_MONTHLY_CAP_TOKENS,
      monthlyEarned,
      nextClaimAt: nextManilaMidnight(now).toISOString(),
    };
  }

  /**
   * Claims today's Tokens: once per Manila day (the idempotency key is the
   * person and the day), stopping at the monthly cap, and only for a verified
   * email. Calling it again the same day pays nothing and says so.
   */
  static async claim(
    userId: string,
    now: Date = new Date(),
  ): Promise<DailyLoginClaim> {
    const status = await this.getStatus(userId, now);
    if (status.claimedToday) {
      return { claimed: false, coinsAwarded: 0, alreadyClaimed: true, status };
    }
    if (status.reason === "email_not_verified") {
      throw new AppError("Verify your email to claim daily login.", 403);
    }
    if (!status.canClaim) {
      return { claimed: false, coinsAwarded: 0, alreadyClaimed: false, status };
    }

    const day = manilaDay(now);
    // The cap trims the last claim of a month instead of refusing it.
    const amount = Math.min(
      status.amount,
      status.monthlyCap - status.monthlyEarned,
    );
    let coinsAwarded = 0;
    let alreadyClaimed = false;
    try {
      const result = await RewardService.grant({
        userId,
        action: DAILY_LOGIN_ACTION,
        refType: "daily_login",
        refId: day,
        idempotencyKey: `daily_login:${userId}:${day}`,
        coinsOverride: amount,
      });
      coinsAwarded = result.coinsAwarded;
      alreadyClaimed = result.isIdempotentReplay === true;
    } catch (e) {
      // Two taps at once: the other one won, so today is claimed.
      if (!isUniqueViolation(e)) throw e;
      alreadyClaimed = true;
    }

    return {
      claimed: coinsAwarded > 0 && !alreadyClaimed,
      coinsAwarded: alreadyClaimed ? 0 : coinsAwarded,
      alreadyClaimed,
      status: await this.getStatus(userId, now),
    };
  }
}
