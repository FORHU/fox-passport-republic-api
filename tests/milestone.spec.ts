import { describe, it, expect, vi, beforeEach } from "vitest";
import MilestoneRepo, {
  MilestoneCounters,
} from "../src/modules/milestone/milestone.repository";
import RewardRepo from "../src/modules/reward/reward.repository";
import RewardService from "../src/modules/reward/reward.service";
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

const paidBookings = vi.spyOn(MilestoneRepo, "listPaidBookings");
const heldRows = vi.spyOn(RewardRepo, "listHeldByAction");
const releaseGrant = vi.spyOn(RewardRepo, "releaseGrant");
const challengePaid = vi.spyOn(MilestoneRepo, "listPaidChallengeRefs");
const inWindow = vi.spyOn(MilestoneRepo, "listBookingsInWindow");

function resetPaidMode() {
  repo.listActiveChallenges.mockReset();
  repo.listActiveChallenges.mockResolvedValue([]);
  challengePaid.mockReset();
  challengePaid.mockResolvedValue([]);
  inWindow.mockReset();
  inWindow.mockResolvedValue([]);
  paidBookings.mockReset();
  paidBookings.mockResolvedValue([]);
  heldRows.mockReset();
  heldRows.mockResolvedValue([]);
  releaseGrant.mockReset();
  releaseGrant.mockResolvedValue(true);
}

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

describe("MilestoneSvc.reconcile (tier Tokens, no back-pay)", () => {
  const LAUNCH = new Date("2026-11-20T00:00:00+08:00");
  const AFTER = new Date("2026-12-01T00:00:00+08:00");

  const counts = (
    over: Partial<MilestoneCounters> = {},
  ): MilestoneCounters => ({
    bookedEvents: 0,
    attendedEvents: 0,
    distinctCities: 0,
    distinctVenues: 0,
    reviews: 0,
    spendPhp: 0,
    ...over,
  });

  const attendedMilestone = {
    key: "attended_events",
    counter: "attended_events",
    counts: "attended",
    tiers,
  } as never;

  /** What the ledger sees: now, and just before launch. */
  function given(now: Partial<MilestoneCounters>, atLaunch = {}) {
    repo.listActiveMilestones.mockResolvedValue([attendedMilestone]);
    repo.getCounters.mockImplementation(async (_user, before) =>
      before ? counts(atLaunch) : counts(now),
    );
  }

  const grant = vi.spyOn(RewardService, "grant");
  const reverse = vi.spyOn(RewardService, "reverse");
  const paidRefs = vi.spyOn(MilestoneRepo, "listPaidTierRefs");

  beforeEach(() => {
    repo.listActiveMilestones.mockReset();
    repo.getCounters.mockReset();
    resetPaidMode();
    grant.mockReset();
    reverse.mockReset();
    reverse.mockResolvedValue({ reversed: true, coinsReversed: 0 });
    paidRefs.mockReset();
    paidRefs.mockResolvedValue([]);
    grant.mockImplementation(async (p) => ({
      coinsAwarded: p.coinsOverride ?? 0,
    }));
  });

  it("pays nothing without a launch instant", async () => {
    given({ attendedEvents: 10 });
    expect(await MilestoneSvc.reconcile("u1", AFTER, null)).toEqual([]);
    expect(grant).not.toHaveBeenCalled();
  });

  it("pays nothing before the launch instant", async () => {
    given({ attendedEvents: 10 });
    expect(
      await MilestoneSvc.reconcile(
        "u1",
        new Date("2026-11-19T00:00:00+08:00"),
        LAUNCH,
      ),
    ).toEqual([]);
    expect(grant).not.toHaveBeenCalled();
  });

  it("pays a tier reached after launch, with a key of person, milestone and tier", async () => {
    given({ attendedEvents: 1 });
    const out = await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(out).toEqual([
      { milestoneKey: "attended_events", tier: 1, tokens: 10, held: false },
    ]);
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        action: "milestone_tier",
        idempotencyKey: "milestone:u1:attended_events:1",
        coinsOverride: 10,
      }),
    );
  });

  it("measures the baseline just before launch", async () => {
    given({ attendedEvents: 1 });
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(repo.getCounters).toHaveBeenCalledWith("u1", LAUNCH);
  });

  it("never pays a tier already reached at launch (badge only)", async () => {
    // 5 attended at launch, 10 now: tiers 1 and 5 were already theirs.
    given({ attendedEvents: 10 }, { attendedEvents: 5 });
    const out = await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(out.map((g) => g.tier)).toEqual([3]);
    expect(grant).toHaveBeenCalledTimes(1);
  });

  it("the 10th attended booking pays tiers 1, 5 and 10 once each", async () => {
    given({ attendedEvents: 10 });
    const out = await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(out.map((g) => g.tokens)).toEqual([10, 25, 50]);
  });

  it("does not report a tier the ledger had already paid", async () => {
    given({ attendedEvents: 1 });
    grant.mockResolvedValue({ coinsAwarded: 10, isIdempotentReplay: true });
    expect(await MilestoneSvc.reconcile("u1", AFTER, LAUNCH)).toEqual([]);
  });

  it("skips a tier that pays 0 Tokens", async () => {
    repo.listActiveMilestones.mockResolvedValue([
      {
        ...(attendedMilestone as object),
        tiers: [{ tier: 1, target: 1, tokens: 0, badgeName: null }],
      },
    ] as never);
    repo.getCounters.mockImplementation(async (_u, before) =>
      before ? counts() : counts({ attendedEvents: 1 }),
    );
    expect(await MilestoneSvc.reconcile("u1", AFTER, LAUNCH)).toEqual([]);
    expect(grant).not.toHaveBeenCalled();
  });
});

describe("MilestoneSvc.reconcile reversal and the sweep", () => {
  const LAUNCH = new Date("2026-11-20T00:00:00+08:00");
  const AFTER = new Date("2026-12-01T00:00:00+08:00");

  const milestone = {
    key: "attended_events",
    counter: "attended_events",
    counts: "attended",
    tiers,
  } as never;

  const reverse = vi.spyOn(RewardService, "reverse");
  const paidRefs = vi.spyOn(MilestoneRepo, "listPaidTierRefs");
  const listUsers = vi.spyOn(MilestoneRepo, "listUsersToReconcile");

  function given(attended: number, paid: string[]) {
    repo.listActiveMilestones.mockResolvedValue([milestone]);
    repo.getCounters.mockResolvedValue({
      bookedEvents: 0,
      attendedEvents: attended,
      distinctCities: 0,
      distinctVenues: 0,
      reviews: 0,
      spendPhp: 0,
    });
    paidRefs.mockResolvedValue(paid);
  }

  beforeEach(() => {
    resetPaidMode();
    reverse.mockReset();
    reverse.mockResolvedValue({ reversed: true, coinsReversed: 25 });
    vi.spyOn(RewardService, "grant").mockResolvedValue({
      coinsAwarded: 0,
      isIdempotentReplay: true,
    });
  });

  it("takes back a paid tier whose count has dropped below its target", async () => {
    // Paid for tier 2 (5 attended), but a refund leaves the count at 1.
    given(1, ["attended_events:2"]);
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(reverse).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        action: "milestone_tier",
        refType: "milestone_tier",
        refId: "attended_events:2",
      }),
    );
  });

  it("keeps a paid tier the count still meets", async () => {
    given(5, ["attended_events:2"]);
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(reverse).not.toHaveBeenCalled();
  });

  it("does nothing for a citizen who was never paid a tier", async () => {
    given(0, []);
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(reverse).not.toHaveBeenCalled();
  });

  it("the sweep reconciles each listed citizen and counts the ones that fail", async () => {
    listUsers.mockResolvedValue(["u1", "u2", "u3"]);
    const rec = vi
      .spyOn(MilestoneSvc, "reconcile")
      .mockImplementation(async (id: string) => {
        if (id === "u2") throw new Error("boom");
        return [];
      });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const since = new Date("2026-11-30T00:00:00Z");
    const out = await MilestoneSvc.sweep(since);
    expect(listUsers).toHaveBeenCalledWith(since);
    expect(rec).toHaveBeenCalledTimes(3);
    expect(out).toEqual({ users: 3, failed: 1 });
    rec.mockRestore();
  });
});

describe("MilestoneSvc.reconcile, the paid-mode booked events milestone", () => {
  const LAUNCH = new Date("2026-11-20T00:00:00+08:00");
  const AFTER = new Date("2026-12-01T00:00:00+08:00");

  const booked = {
    key: "booked_events",
    counter: "booked_events",
    counts: "paid",
    tiers,
  } as never;

  const grant = vi.spyOn(RewardService, "grant");
  const reverse = vi.spyOn(RewardService, "reverse");
  const paidRefs = vi.spyOn(MilestoneRepo, "listPaidTierRefs");

  /** `booked` paid bookings, the first `attended` of them attended. */
  function given(booked_: number, attended: number, atLaunch = 0) {
    repo.listActiveMilestones.mockResolvedValue([booked]);
    repo.getCounters.mockImplementation(async (_u, before) => ({
      bookedEvents: before ? atLaunch : booked_,
      attendedEvents: 0,
      distinctCities: 0,
      distinctVenues: 0,
      reviews: 0,
      spendPhp: 0,
    }));
    paidBookings.mockResolvedValue(
      Array.from({ length: booked_ }, (_, i) => ({
        id: `b${i + 1}`,
        attended: i < attended,
      })),
    );
  }

  beforeEach(() => {
    resetPaidMode();
    grant.mockReset();
    grant.mockImplementation(async (p) => ({
      coinsAwarded: p.coinsOverride ?? 0,
    }));
    reverse.mockReset();
    reverse.mockResolvedValue({ reversed: true, coinsReversed: 0 });
    paidRefs.mockReset();
    paidRefs.mockResolvedValue([]);
  });

  it("holds the tier as Pending while a booking behind it is unattended", async () => {
    given(1, 0);
    const out = await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(out).toEqual([
      { milestoneKey: "booked_events", tier: 1, tokens: 10, held: true },
    ]);
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({ holdUntilAttended: true }),
    );
  });

  it("pays at once when every booking behind the tier is already attended", async () => {
    given(1, 1);
    const out = await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(out[0].held).toBe(false);
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({ holdUntilAttended: false }),
    );
  });

  it("looks only at the first N bookings for a tier of N, not the later ones", async () => {
    // 6 booked, the first 5 attended: tier 2 (5) is covered, tier 1 too.
    given(6, 5);
    const out = await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(out.map((g) => [g.tier, g.held])).toEqual([
      [1, false],
      [2, false],
    ]);
  });

  it("frees a held tier only when its own bookings are attended", async () => {
    given(1, 1);
    heldRows.mockResolvedValue([
      { id: "ev-held", refId: "booked_events:1", coins: 10 },
    ]);
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(releaseGrant).toHaveBeenCalledTimes(1);
    expect(releaseGrant).toHaveBeenCalledWith(
      "ev-held",
      "u1",
      expect.stringContaining("booked_events tier 1"),
    );
  });

  it("keeps a tier held while one of its bookings is still unattended", async () => {
    given(5, 4);
    heldRows.mockResolvedValue([
      { id: "ev-held", refId: "booked_events:2", coins: 25 },
    ]);
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(releaseGrant).not.toHaveBeenCalled();
  });

  it("does not free tier 1 because some other booking was attended", async () => {
    // Tier 2 (5 bookings) is held; tier 1's single booking is attended, but
    // that must not free tier 2.
    given(5, 1);
    heldRows.mockResolvedValue([
      { id: "ev-t2", refId: "booked_events:2", coins: 25 },
    ]);
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(releaseGrant).not.toHaveBeenCalled();
  });

  it("takes back a held or paid tier when a cancellation drops the count", async () => {
    given(4, 0);
    paidRefs.mockResolvedValue(["booked_events:2"]);
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(reverse).toHaveBeenCalledWith(
      expect.objectContaining({ refId: "booked_events:2" }),
    );
  });

  it("never pays a tier already reached at launch", async () => {
    given(5, 5, 5);
    const out = await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(out).toEqual([]);
  });
});

describe("MilestoneSvc.reconcile, booking challenges", () => {
  const LAUNCH = new Date("2026-11-20T00:00:00+08:00");
  // Tue 1 Dec 2026, Manila: its week began Mon 30 Nov 00:00 Manila.
  const AFTER = new Date("2026-12-01T10:00:00+08:00");
  const WEEK_START = "2026-11-29T16:00:00.000Z";

  const weekly = {
    key: "weekly_regular",
    period: "week",
    target: 3,
    tokens: 30,
    startsAt: null,
    endsAt: null,
  } as never;

  const grant = vi.spyOn(RewardService, "grant");
  const reverse = vi.spyOn(RewardService, "reverse");

  function given(
    bookings: { id: string; attended: boolean }[],
    challenge: object = weekly as object,
  ) {
    repo.listActiveMilestones.mockResolvedValue([]);
    repo.getCounters.mockResolvedValue({
      bookedEvents: 0,
      attendedEvents: 0,
      distinctCities: 0,
      distinctVenues: 0,
      reviews: 0,
      spendPhp: 0,
    });
    repo.listActiveChallenges.mockResolvedValue([challenge] as never);
    inWindow.mockResolvedValue(bookings);
  }

  const bk = (n: number, attended: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `b${i + 1}`,
      attended: i < attended,
    }));

  beforeEach(() => {
    resetPaidMode();
    grant.mockReset();
    grant.mockImplementation(async (p) => ({
      coinsAwarded: p.coinsOverride ?? 0,
    }));
    reverse.mockReset();
    reverse.mockResolvedValue({ reversed: true, coinsReversed: 0 });
  });

  it("pays once per period, keyed by the person, the challenge and the period start", async () => {
    given(bk(3, 3));
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(grant).toHaveBeenCalledTimes(1);
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "challenge_period",
        refId: `weekly_regular:${WEEK_START}`,
        idempotencyKey: `challenge:u1:weekly_regular:${WEEK_START}`,
        coinsOverride: 30,
        holdUntilAttended: false,
      }),
    );
  });

  it("holds the Tokens while one of the bookings behind it is unattended", async () => {
    given(bk(3, 2));
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({ holdUntilAttended: true }),
    );
  });

  it("pays nothing below the target", async () => {
    given(bk(2, 2));
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(grant).not.toHaveBeenCalled();
  });

  it("skips a challenge that pays 0 Tokens, as the seeded ones do", async () => {
    given(bk(3, 3), { ...(weekly as object), tokens: 0 });
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(grant).not.toHaveBeenCalled();
  });

  it("does not count bookings from before launch in a period already under way", async () => {
    given(bk(3, 3));
    // Sat 21 Nov: the week began Mon 16 Nov, before the 20 Nov launch.
    await MilestoneSvc.reconcile(
      "u1",
      new Date("2026-11-21T10:00:00+08:00"),
      LAUNCH,
    );
    expect(inWindow).toHaveBeenCalledWith("u1", LAUNCH, expect.any(Date));
  });

  it("skips a challenge outside its own dates", async () => {
    given(bk(3, 3), {
      ...(weekly as object),
      endsAt: new Date("2026-11-25T00:00:00+08:00"),
    });
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(grant).not.toHaveBeenCalled();
  });

  it("takes back a paid period when a cancellation drops it below the target", async () => {
    given(bk(2, 2));
    challengePaid.mockResolvedValue([`weekly_regular:${WEEK_START}`]);
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(reverse).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "challenge_period",
        refId: `weekly_regular:${WEEK_START}`,
      }),
    );
  });

  it("frees a held challenge when its own bookings are attended", async () => {
    given(bk(3, 3));
    heldRows.mockImplementation(async (_u, action) =>
      action === "challenge_period"
        ? [{ id: "ev-ch", refId: `weekly_regular:${WEEK_START}`, coins: 30 }]
        : [],
    );
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(releaseGrant).toHaveBeenCalledWith(
      "ev-ch",
      "u1",
      expect.stringContaining("weekly_regular"),
    );
  });

  it("keeps a held challenge while a booking behind it is unattended", async () => {
    given(bk(3, 2));
    heldRows.mockImplementation(async (_u, action) =>
      action === "challenge_period"
        ? [{ id: "ev-ch", refId: `weekly_regular:${WEEK_START}`, coins: 30 }]
        : [],
    );
    await MilestoneSvc.reconcile("u1", AFTER, LAUNCH);
    expect(releaseGrant).not.toHaveBeenCalled();
  });
});
