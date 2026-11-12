import { ChallengeWindow, MilestoneCounter } from "@prisma/client";
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

export class MilestoneSvc {
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
