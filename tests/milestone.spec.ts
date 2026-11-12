import { describe, it, expect, vi, beforeEach } from "vitest";
import MilestoneRepo from "../src/modules/milestone/milestone.repository";
import MilestoneSvc, {
  manilaPeriod,
  tierProgress,
  counterValue,
} from "../src/modules/milestone/milestone.service";

// Spies on the real repository class, so nothing depends on module mocking.
const repo = {
  listActiveMilestones: vi.spyOn(MilestoneRepo, "listActiveMilestones"),
  listActiveChallenges: vi.spyOn(MilestoneRepo, "listActiveChallenges"),
  getCounters: vi.spyOn(MilestoneRepo, "getCounters"),
  countQualifyingBookings: vi.spyOn(MilestoneRepo, "countQualifyingBookings"),
};

const tiers = [1, 5, 10, 25, 50].map((target, i) => ({
  tier: i + 1,
  target,
  tokens: [10, 25, 50, 100, 200][i],
  badgeName: null,
}));

describe("manilaPeriod (Asia/Manila, UTC+8)", () => {
  // Fri 13 Nov 2026, 04:00 in Manila = Thu 12 Nov 20:00 UTC
  const now = new Date("2026-11-12T20:00:00Z");

  it("day runs from Manila midnight to the next", () => {
    const { start, end } = manilaPeriod("day", now);
    expect(start.toISOString()).toBe("2026-11-12T16:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-13T16:00:00.000Z");
  });

  it("week starts on Monday", () => {
    const { start, end } = manilaPeriod("week", now);
    expect(start.toISOString()).toBe("2026-11-08T16:00:00.000Z"); // Mon 9 Nov, Manila
    expect(end.toISOString()).toBe("2026-11-15T16:00:00.000Z");
  });

  it("week on a Sunday still starts the Monday before", () => {
    // Sun 15 Nov 2026 12:00 Manila
    const { start } = manilaPeriod("week", new Date("2026-11-15T04:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-08T16:00:00.000Z");
  });

  it("month starts on the 1st in Manila", () => {
    const { start, end } = manilaPeriod("month", now);
    expect(start.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });

  it("11pm UTC on the 30th is already the 1st in Manila", () => {
    const { start } = manilaPeriod("month", new Date("2026-11-30T17:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-30T16:00:00.000Z");
  });
});

describe("tierProgress (cumulative tiers 1, 5, 10, 25, 50)", () => {
  it("before the first tier nothing is reached", () => {
    const p = tierProgress(tiers, 0);
    expect(p.currentTier).toBe(0);
    expect(p.nextTier).toBe(1);
    expect(p.progressPercentage).toBe(0);
    expect(p.tiers.every((t) => !t.isReached)).toBe(true);
  });

  it("the 10th booking reaches tiers 1, 5 and 10 together", () => {
    const p = tierProgress(tiers, 10);
    expect(p.tiers.filter((t) => t.isReached).map((t) => t.target)).toEqual([
      1, 5, 10,
    ]);
    expect(p.currentTier).toBe(3);
    expect(p.nextTier).toBe(4);
  });

  it("progress is toward the next tier from the one before", () => {
    // 7 of the way from 5 to 10 is 40%
    expect(tierProgress(tiers, 7).progressPercentage).toBe(40);
  });

  it("is complete at the last tier", () => {
    const p = tierProgress(tiers, 80);
    expect(p.isCompleted).toBe(true);
    expect(p.nextTier).toBeNull();
    expect(p.progressPercentage).toBe(100);
  });

  it("orders tiers by target whatever order they arrive in", () => {
    const p = tierProgress([...tiers].reverse(), 5);
    expect(p.tiers.map((t) => t.target)).toEqual([1, 5, 10, 25, 50]);
  });
});

describe("counterValue", () => {
  const counters = {
    bookedEvents: 3,
    attendedEvents: 2,
    distinctCities: 1,
    distinctVenues: 2,
    reviews: 4,
    spendPhp: 21500,
  };
  it("maps each counter", () => {
    expect(counterValue("booked_events", counters)).toBe(3);
    expect(counterValue("attended_events", counters)).toBe(2);
    expect(counterValue("cities", counters)).toBe(1);
    expect(counterValue("venues", counters)).toBe(2);
    expect(counterValue("reviews", counters)).toBe(4);
    expect(counterValue("spend", counters)).toBe(21500);
  });
});

describe("MilestoneSvc.getMine", () => {
  const now = new Date("2026-11-12T20:00:00Z");
  beforeEach(() => {
    vi.clearAllMocks();
    repo.listActiveMilestones.mockResolvedValue([
      {
        key: "big_spender",
        name: "Big Spender",
        description: null,
        counter: "spend",
        counts: "attended",
        tiers: [
          { tier: 1, target: 20000, tokens: 0, badgeName: null },
          { tier: 2, target: 50000, tokens: 0, badgeName: null },
        ],
      },
    ] as never);
    repo.listActiveChallenges.mockResolvedValue([
      {
        key: "weekly_regular",
        name: "Weekly regular",
        description: null,
        period: "week",
        target: 3,
        tokens: 0,
        startsAt: null,
        endsAt: null,
      },
      {
        key: "expired",
        name: "Expired",
        description: null,
        period: "day",
        target: 1,
        tokens: 0,
        startsAt: null,
        endsAt: new Date("2026-11-01T00:00:00Z"),
      },
    ] as never);
    repo.getCounters.mockResolvedValue({
      bookedEvents: 0,
      attendedEvents: 0,
      distinctCities: 0,
      distinctVenues: 0,
      reviews: 0,
      spendPhp: 21500,
    } as never);
    repo.countQualifyingBookings.mockResolvedValue(4 as never);
  });

  it("shows Big Spender in pesos and the reached tier", async () => {
    const res = await MilestoneSvc.getMine("u1", now);
    const m = res.milestones[0];
    expect(m.unit).toBe("php");
    expect(m.currentCount).toBe(21500);
    expect(m.currentTier).toBe(1);
    expect(m.nextTier).toBe(2);
  });

  it("caps a challenge at its target and marks it complete", async () => {
    const res = await MilestoneSvc.getMine("u1", now);
    expect(res.challenges).toHaveLength(1); // the ended one is left out
    expect(res.challenges[0]).toMatchObject({
      key: "weekly_regular",
      currentCount: 3,
      isCompleted: true,
      periodStart: "2026-11-08T16:00:00.000Z",
      periodEnd: "2026-11-15T16:00:00.000Z",
    });
  });

  it("counts a challenge over the Manila week only", async () => {
    await MilestoneSvc.getMine("u1", now);
    const [, from, to] = repo.countQualifyingBookings.mock.calls[0];
    expect(from.toISOString()).toBe("2026-11-08T16:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-15T16:00:00.000Z");
  });

  it("only reads: the repository has no write or grant methods", () => {
    const names = Object.getOwnPropertyNames(MilestoneRepo).filter(
      (n) =>
        typeof (MilestoneRepo as never as Record<string, unknown>)[n] ===
        "function",
    );
    expect(
      names.filter((n) =>
        /create|update|delete|upsert|record|grant|award/i.test(n),
      ),
    ).toEqual([]);
  });
});
