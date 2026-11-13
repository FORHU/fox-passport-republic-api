import { ChallengeWindow, MilestoneCounter } from "@prisma/client";
import { MILESTONES_LAUNCH_AT } from "../../config";
import RewardRepo, {
  CHALLENGE_PERIOD_ACTION,
  MILESTONE_TIER_ACTION,
} from "../reward/reward.repository";
import RewardService from "../reward/reward.service";
import MilestoneRepo, { MilestoneCounters } from "./milestone.repository";
import {
  ChallengeProgress,
  MilestoneProgress,
  MyMilestonesResponse,
} from "./milestone.types";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila is UTC+8, no DST
const DAY_MS = 24 * 60 * 60 * 1000;

/** The start and end of the day, week (Monday) or month holding `now`, in Manila time. */
export function manilaPeriod(
  period: ChallengeWindow,
  now: Date,
): { start: Date; end: Date } {
  // Shift so the UTC fields read as Manila wall-clock time, then shift back.
  const local = new Date(now.getTime() + MANILA_OFFSET_MS);
  const dayStart = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );

  let start: number;
  let end: number;
  if (period === "day") {
    start = dayStart;
    end = start + DAY_MS;
  } else if (period === "week") {
    const sinceMonday = (local.getUTCDay() + 6) % 7;
    start = dayStart - sinceMonday * DAY_MS;
    end = start + 7 * DAY_MS;
  } else {
    start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1);
    end = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1);
  }
  return {
    start: new Date(start - MANILA_OFFSET_MS),
    end: new Date(end - MANILA_OFFSET_MS),
  };
}

/** Which counter value feeds a milestone. */
export function counterValue(
  counter: MilestoneCounter,
  counters: MilestoneCounters,
): number {
  switch (counter) {
    case "booked_events":
      return counters.bookedEvents;
    case "attended_events":
      return counters.attendedEvents;
    case "cities":
      return counters.distinctCities;
    case "venues":
      return counters.distinctVenues;
    case "reviews":
      return counters.reviews;
    case "spend":
      return counters.spendPhp;
  }
}

/**
 * Where a count stands on a milestone's tiers. Cumulative: every tier at or
 * below the count is reached. Progress is toward the next tier, measured from
 * the one before it, so it starts again at 0 after each tier.
 */
export function tierProgress(
  tiers: {
    tier: number;
    target: number;
    tokens: number;
    badgeName: string | null;
  }[],
  count: number,
) {
  const ordered = [...tiers].sort((a, b) => a.target - b.target);
  const reached = ordered.filter((t) => count >= t.target);
  const next = ordered.find((t) => count < t.target) ?? null;
  const currentTier = reached.length ? reached[reached.length - 1].tier : 0;

  let progressPercentage = 100;
  if (next) {
    const floor = reached.length ? reached[reached.length - 1].target : 0;
    const span = next.target - floor;
    progressPercentage = Math.max(
      0,
      Math.min(100, Math.round(((count - floor) / span) * 100)),
    );
  }
  return {
    currentTier,
    nextTier: next ? next.tier : null,
    progressPercentage,
    isCompleted: next === null && ordered.length > 0,
    tiers: ordered.map((t) => ({
      tier: t.tier,
      target: t.target,
      tokens: t.tokens,
      badgeName: t.badgeName,
      isReached: count >= t.target,
    })),
  };
}

export interface TierGrant {
  milestoneKey: string;
  tier: number;
  tokens: number;
  /** Paid, but held as Pending until the bookings behind the tier are attended. */
  held: boolean;
}

export class MilestoneSvc {
  /**
   * Pays the tiers a citizen has newly reached: each tier once, ever (the
   * grant's idempotency key is the person, the milestone and the tier, so
   * running this again, or after a refund and a new booking, pays nothing
   * more).
   *
   * A tier already reached before `launchAt` is a badge only and never pays
   * (no back-pay), so this measures each count against the same count taken
   * just before launch. Without a launch instant nothing pays.
   *
   * Only milestones that count attended bookings pay here. Those counts come
   * from passport stamps, written on check-in, so nothing they pay is ever
   * waiting on an unattended booking. The "paid" mode milestone (booked events)
   * needs Tokens held until its bookings are attended, and a release that frees
   * only that grant; it does not pay yet.
   */
  static async reconcile(
    userId: string,
    now: Date = new Date(),
    launchAt: Date | null = MILESTONES_LAUNCH_AT,
  ): Promise<TierGrant[]> {
    if (!launchAt || now < launchAt) return [];

    const [milestones, counters, baseline] = await Promise.all([
      MilestoneRepo.listActiveMilestones(),
      MilestoneRepo.getCounters(userId),
      MilestoneRepo.getCounters(userId, launchAt),
    ]);

    // Only read when a paid-mode milestone needs it.
    let bookings: { id: string; attended: boolean }[] | null = null;
    const paidBookings = async () =>
      (bookings ??= await MilestoneRepo.listPaidBookings(userId));

    const granted: TierGrant[] = [];
    for (const m of milestones) {
      const count = counterValue(m.counter, counters);
      const before = counterValue(m.counter, baseline);
      for (const t of m.tiers) {
        if (t.tokens <= 0) continue;
        if (count < t.target || before >= t.target) continue;

        // A paid-mode tier is held until every booking behind it (the first
        // `target` paid bookings) has been attended.
        const held =
          m.counts === "paid" &&
          (await paidBookings()).slice(0, t.target).some((b) => !b.attended);

        const result = await RewardService.grant({
          userId,
          action: MILESTONE_TIER_ACTION,
          refType: "milestone_tier",
          refId: `${m.key}:${t.tier}`,
          idempotencyKey: `milestone:${userId}:${m.key}:${t.tier}`,
          coinsOverride: t.tokens,
          holdUntilAttended: held,
        });
        if (!result.isIdempotentReplay && result.coinsAwarded > 0) {
          granted.push({
            milestoneKey: m.key,
            tier: t.tier,
            tokens: result.coinsAwarded,
            held,
          });
        }
      }
    }
    await this.reconcileChallenges(userId, now, launchAt);
    await this.reverseLostTiers(userId, milestones, counters);
    await this.releaseHeldTiers(userId, milestones, paidBookings);
    await this.releaseHeldChallenges(userId, launchAt);
    return granted;
  }

  /**
   * Pays each booking challenge once per period: a grant keyed by the person,
   * the challenge and the period's start, so a period pays once and the next
   * period is a new key. Only bookings made at or after launch count, so a
   * period already under way at launch is not back-paid. The Tokens are held
   * until the first N bookings (N the target) are all attended, and taken back
   * if a cancellation drops the period below its target.
   */
  private static async reconcileChallenges(
    userId: string,
    now: Date,
    launchAt: Date,
  ): Promise<void> {
    const live = (await MilestoneRepo.listActiveChallenges()).filter(
      (c) =>
        c.tokens > 0 &&
        (!c.startsAt || c.startsAt <= now) &&
        (!c.endsAt || c.endsAt > now),
    );
    if (live.length === 0) return;

    const paid = new Set(await MilestoneRepo.listPaidChallengeRefs(userId));
    for (const c of live) {
      const { start, end } = manilaPeriod(c.period, now);
      const from = start < launchAt ? launchAt : start;
      const bookings = await MilestoneRepo.listBookingsInWindow(
        userId,
        from,
        end,
      );
      const refId = `${c.key}:${start.toISOString()}`;
      if (bookings.length >= c.target) {
        await RewardService.grant({
          userId,
          action: CHALLENGE_PERIOD_ACTION,
          refType: "challenge_period",
          refId,
          idempotencyKey: `challenge:${userId}:${refId}`,
          coinsOverride: c.tokens,
          holdUntilAttended: bookings
            .slice(0, c.target)
            .some((b) => !b.attended),
        });
      } else if (paid.has(refId)) {
        await RewardService.reverse({
          userId,
          action: CHALLENGE_PERIOD_ACTION,
          refType: "challenge_period",
          refId,
          reason: `Challenge ${c.key} no longer met`,
        });
      }
    }
  }

  /** Frees a held challenge grant once its own period's bookings are attended. */
  private static async releaseHeldChallenges(
    userId: string,
    launchAt: Date,
  ): Promise<void> {
    const held = await RewardRepo.listHeldByAction(
      userId,
      CHALLENGE_PERIOD_ACTION,
    );
    if (held.length === 0) return;
    const challenges = await MilestoneRepo.listActiveChallenges();
    for (const grant of held) {
      const at = grant.refId.indexOf(":");
      const c = challenges.find((x) => x.key === grant.refId.slice(0, at));
      if (!c) continue;
      const { start, end } = manilaPeriod(
        c.period,
        new Date(grant.refId.slice(at + 1)),
      );
      const bookings = await MilestoneRepo.listBookingsInWindow(
        userId,
        start < launchAt ? launchAt : start,
        end,
      );
      if (bookings.length < c.target) continue;
      if (bookings.slice(0, c.target).some((b) => !b.attended)) continue;
      await RewardRepo.releaseGrant(
        grant.id,
        userId,
        `Released: the bookings behind challenge ${c.key} were attended`,
      );
    }
  }

  /**
   * Frees a held paid-mode tier once every booking behind it has been
   * attended: the first `target` paid bookings, read from the database now, so
   * a cancelled booking that was replaced by another is handled. Only that
   * grant is released; no other held Tokens are touched.
   */
  private static async releaseHeldTiers(
    userId: string,
    milestones: Awaited<ReturnType<typeof MilestoneRepo.listActiveMilestones>>,
    paidBookings: () => Promise<{ id: string; attended: boolean }[]>,
  ): Promise<void> {
    const held = await RewardRepo.listHeldByAction(
      userId,
      MILESTONE_TIER_ACTION,
    );
    if (held.length === 0) return;
    for (const grant of held) {
      const [key, tierText] = grant.refId.split(":");
      const m = milestones.find((x) => x.key === key);
      const tier = m?.tiers.find((x) => x.tier === Number(tierText));
      if (!m || !tier || m.counts !== "paid") continue;
      const behind = (await paidBookings()).slice(0, tier.target);
      if (behind.length < tier.target || behind.some((b) => !b.attended)) {
        continue;
      }
      await RewardRepo.releaseGrant(
        grant.id,
        userId,
        `Released: the bookings behind ${key} tier ${tier.tier} were attended`,
      );
    }
  }

  /**
   * Takes back the Tokens of a tier whose count has dropped below its target
   * (a cancelled booking, a refund, a chargeback). The badge stays, and the
   * tier is not paid a second time if the count recovers: it was paid once.
   * Each reversal is its own append-only ledger row and is guarded against
   * running twice, so this is safe to repeat.
   */
  private static async reverseLostTiers(
    userId: string,
    milestones: Awaited<ReturnType<typeof MilestoneRepo.listActiveMilestones>>,
    counters: MilestoneCounters,
  ): Promise<void> {
    const paid = new Set(await MilestoneRepo.listPaidTierRefs(userId));
    if (paid.size === 0) return;
    for (const m of milestones) {
      const count = counterValue(m.counter, counters);
      for (const t of m.tiers) {
        const refId = `${m.key}:${t.tier}`;
        if (!paid.has(refId) || count >= t.target) continue;
        await RewardService.reverse({
          userId,
          action: MILESTONE_TIER_ACTION,
          refType: "milestone_tier",
          refId,
          reason: `Milestone ${m.key} tier ${t.tier} no longer reached`,
        });
      }
    }
  }

  /**
   * The nightly sweep: reconciles every citizen with a new stamp, review or
   * refund since [since]. One failure is logged and does not stop the rest.
   */
  static async sweep(since: Date): Promise<{ users: number; failed: number }> {
    const users = await MilestoneRepo.listUsersToReconcile(since);
    let failed = 0;
    for (const userId of users) {
      try {
        await this.reconcile(userId);
      } catch (e) {
        failed++;
        console.error("[MilestoneSvc] sweep failed for a citizen", e);
      }
    }
    return { users: users.length, failed };
  }

  /**
   * A citizen's milestones and challenges with live progress. Read only:
   * nothing is granted here.
   */
  static async getMine(
    userId: string,
    now: Date = new Date(),
  ): Promise<MyMilestonesResponse> {
    const [milestones, challenges, counters] = await Promise.all([
      MilestoneRepo.listActiveMilestones(),
      MilestoneRepo.listActiveChallenges(),
      MilestoneRepo.getCounters(userId),
    ]);

    const milestoneRows: MilestoneProgress[] = milestones.map((m) => {
      const currentCount = counterValue(m.counter, counters);
      return {
        key: m.key,
        name: m.name,
        description: m.description,
        counter: m.counter,
        counts: m.counts,
        unit: m.counter === "spend" ? "php" : "count",
        currentCount,
        ...tierProgress(m.tiers, currentCount),
      };
    });

    const live = challenges.filter(
      (c) =>
        (!c.startsAt || c.startsAt <= now) && (!c.endsAt || c.endsAt > now),
    );
    const challengeRows: ChallengeProgress[] = await Promise.all(
      live.map(async (c) => {
        const { start, end } = manilaPeriod(c.period, now);
        const count = await MilestoneRepo.countQualifyingBookings(
          userId,
          start,
          end,
        );
        return {
          key: c.key,
          name: c.name,
          description: c.description,
          period: c.period,
          target: c.target,
          tokens: c.tokens,
          currentCount: Math.min(count, c.target),
          isCompleted: count >= c.target,
          periodStart: start.toISOString(),
          periodEnd: end.toISOString(),
        };
      }),
    );

    return { milestones: milestoneRows, challenges: challengeRows };
  }
}

export default MilestoneSvc;
