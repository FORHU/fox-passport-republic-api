import { afterEach, describe, expect, it, vi } from "vitest";
import DailyLoginSvc, {
  cycleAmounts,
  cycleDayOf,
  dayBefore,
  manilaDay,
  manilaMonthStart,
  nextManilaMidnight,
  streakOf,
} from "../src/modules/daily-login/daily-login.service";
import DailyLoginRepo from "../src/modules/daily-login/daily-login.repository";
import RewardRepo from "../src/modules/reward/reward.repository";
import RewardService from "../src/modules/reward/reward.service";
import { AppError } from "../src/utils/errors";

const USER = "user-1";
// 2026-11-13 10:00 in Manila (02:00 UTC).
const NOW = new Date("2026-11-13T02:00:00.000Z");

function rule(overrides: Partial<{ coins: number; active: boolean }> = {}) {
  return {
    id: "rule-daily-login",
    action: "daily_login",
    xp: 0,
    coins: 15,
    dailyCap: 1,
    onceOnly: false,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** The state a person is in: what the ledger holds and their email. */
function given(opts: {
  emailVerified?: boolean | null;
  days?: string[];
  earned?: number;
  rule?: ReturnType<typeof rule> | null;
}) {
  vi.spyOn(DailyLoginRepo, "getEmailVerified").mockResolvedValue(
    opts.emailVerified === undefined ? true : opts.emailVerified,
  );
  vi.spyOn(DailyLoginRepo, "listClaimedDays").mockResolvedValue(
    opts.days ?? [],
  );
  vi.spyOn(DailyLoginRepo, "sumCoinsSince").mockResolvedValue(opts.earned ?? 0);
  vi.spyOn(RewardRepo, "findRuleByAction").mockResolvedValue(
    opts.rule === undefined ? rule() : opts.rule,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("Manila days", () => {
  it("rolls the day at midnight in Manila, not UTC", () => {
    // 15:59 UTC is 23:59 in Manila; one minute later it is the next day.
    expect(manilaDay(new Date("2026-11-13T15:59:00.000Z"))).toBe("2026-11-13");
    expect(manilaDay(new Date("2026-11-13T16:00:00.000Z"))).toBe("2026-11-14");
  });

  it("finds the day before, across a month and a year", () => {
    expect(dayBefore("2026-11-01")).toBe("2026-10-31");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
  });

  it("starts the month at Manila midnight on the 1st", () => {
    expect(manilaMonthStart(NOW).toISOString()).toBe(
      "2026-10-31T16:00:00.000Z",
    );
  });

  it("names when the next day starts", () => {
    expect(nextManilaMidnight(NOW).toISOString()).toBe(
      "2026-11-13T16:00:00.000Z",
    );
  });
});

describe("streakOf", () => {
  it("counts the days in a row up to today", () => {
    const days = new Set(["2026-11-13", "2026-11-12", "2026-11-11"]);
    expect(streakOf(days, "2026-11-13")).toBe(3);
  });

  it("keeps the streak alive until a whole day is missed", () => {
    const days = new Set(["2026-11-12", "2026-11-11"]);
    expect(streakOf(days, "2026-11-13")).toBe(2);
  });

  it("starts over after a missed day", () => {
    const days = new Set(["2026-11-10", "2026-11-09"]);
    expect(streakOf(days, "2026-11-13")).toBe(0);
  });

  it("stops at a gap", () => {
    const days = new Set(["2026-11-13", "2026-11-12", "2026-11-10"]);
    expect(streakOf(days, "2026-11-13")).toBe(2);
  });
});

describe("the 7-day cycle", () => {
  it("starts at day 1 with no streak", () => {
    expect(cycleDayOf(0, false)).toBe(1);
  });

  it("is the day after the streak while today is unclaimed", () => {
    expect(cycleDayOf(1, false)).toBe(2);
    expect(cycleDayOf(6, false)).toBe(7);
  });

  it("is the day just claimed once today is claimed", () => {
    expect(cycleDayOf(1, true)).toBe(1);
    expect(cycleDayOf(3, true)).toBe(3);
    expect(cycleDayOf(7, true)).toBe(7);
  });

  it("wraps to day 1 after day 7, however long the streak", () => {
    expect(cycleDayOf(7, false)).toBe(1);
    expect(cycleDayOf(8, true)).toBe(1);
    expect(cycleDayOf(15, false)).toBe(2);
  });

  it("pays the same every day with no day 7 bonus", () => {
    expect(cycleAmounts(15, 0)).toEqual([15, 15, 15, 15, 15, 15, 15]);
  });

  it("adds the bonus on day 7 only: 5 a day and +20 on day 7 is 5 plus 15", () => {
    expect(cycleAmounts(5, 15)).toEqual([5, 5, 5, 5, 5, 5, 20]);
  });
});

describe("DailyLoginSvc.getStatus", () => {
  it("is claimable for a verified person who has not claimed today", async () => {
    given({ days: ["2026-11-12"] });
    const s = await DailyLoginSvc.getStatus(USER, NOW);
    expect(s).toMatchObject({
      claimedToday: false,
      canClaim: true,
      reason: null,
      amount: 15,
      nextAmount: 15,
      cycleDay: 2,
      cycle: [15, 15, 15, 15, 15, 15, 15],
      streak: 1,
      monthlyCap: 100,
      monthlyEarned: 0,
      nextClaimAt: "2026-11-13T16:00:00.000Z",
    });
  });

  it("says claimed once today is in the ledger", async () => {
    given({ days: ["2026-11-13", "2026-11-12"], earned: 30 });
    const s = await DailyLoginSvc.getStatus(USER, NOW);
    expect(s.claimedToday).toBe(true);
    expect(s.canClaim).toBe(false);
    expect(s.streak).toBe(2);
  });

  it("blocks an unverified email and says why", async () => {
    given({ emailVerified: false });
    const s = await DailyLoginSvc.getStatus(USER, NOW);
    expect(s.canClaim).toBe(false);
    expect(s.reason).toBe("email_not_verified");
  });

  it("blocks at the monthly cap", async () => {
    given({ earned: 100 });
    const s = await DailyLoginSvc.getStatus(USER, NOW);
    expect(s.canClaim).toBe(false);
    expect(s.reason).toBe("cap_reached");
  });

  it("is inactive when the rule is off or missing", async () => {
    given({ rule: rule({ active: false }) });
    expect((await DailyLoginSvc.getStatus(USER, NOW)).reason).toBe("inactive");
    given({ rule: null });
    expect((await DailyLoginSvc.getStatus(USER, NOW)).amount).toBe(0);
  });

  it("is not found for an unknown person", async () => {
    given({ emailVerified: null });
    await expect(DailyLoginSvc.getStatus(USER, NOW)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("DailyLoginSvc.claim", () => {
  it("pays the day's Tokens with a key that is the person and the Manila day", async () => {
    given({});
    const grant = vi
      .spyOn(RewardService, "grant")
      .mockResolvedValue({ coinsAwarded: 15 });
    const result = await DailyLoginSvc.claim(USER, NOW);
    expect(grant).toHaveBeenCalledWith({
      userId: USER,
      action: "daily_login",
      refType: "daily_login",
      refId: "2026-11-13",
      idempotencyKey: "daily_login:user-1:2026-11-13",
      coinsOverride: 15,
    });
    expect(result.claimed).toBe(true);
    expect(result.coinsAwarded).toBe(15);
  });

  it("pays nothing a second time the same day", async () => {
    given({ days: ["2026-11-13"] });
    const grant = vi.spyOn(RewardService, "grant");
    const result = await DailyLoginSvc.claim(USER, NOW);
    expect(grant).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      claimed: false,
      coinsAwarded: 0,
      alreadyClaimed: true,
    });
  });

  it("treats a replayed grant as already claimed", async () => {
    given({});
    vi.spyOn(RewardService, "grant").mockResolvedValue({
      coinsAwarded: 15,
      isIdempotentReplay: true,
    });
    const result = await DailyLoginSvc.claim(USER, NOW);
    expect(result).toMatchObject({
      claimed: false,
      coinsAwarded: 0,
      alreadyClaimed: true,
    });
  });

  it("treats two taps at once as one claim", async () => {
    given({});
    vi.spyOn(RewardService, "grant").mockRejectedValue(
      Object.assign(new Error("Unique constraint"), { code: "P2002" }),
    );
    const result = await DailyLoginSvc.claim(USER, NOW);
    expect(result.alreadyClaimed).toBe(true);
    expect(result.claimed).toBe(false);
  });

  it("trims the last claim of a month to what is left of the cap", async () => {
    given({ earned: 95 });
    const grant = vi
      .spyOn(RewardService, "grant")
      .mockResolvedValue({ coinsAwarded: 5 });
    await DailyLoginSvc.claim(USER, NOW);
    expect(grant).toHaveBeenCalledWith(
      expect.objectContaining({ coinsOverride: 5 }),
    );
  });

  it("pays nothing at the cap, without an error", async () => {
    given({ earned: 100 });
    const grant = vi.spyOn(RewardService, "grant");
    const result = await DailyLoginSvc.claim(USER, NOW);
    expect(grant).not.toHaveBeenCalled();
    expect(result.claimed).toBe(false);
    expect(result.status.reason).toBe("cap_reached");
  });

  it("refuses an unverified email with a 403", async () => {
    given({ emailVerified: false });
    const grant = vi.spyOn(RewardService, "grant");
    await expect(DailyLoginSvc.claim(USER, NOW)).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(DailyLoginSvc.claim(USER, NOW)).rejects.toMatchObject({
      status: 403,
    });
    expect(grant).not.toHaveBeenCalled();
  });

  it("passes on an error that is not a duplicate", async () => {
    given({});
    vi.spyOn(RewardService, "grant").mockRejectedValue(new Error("db down"));
    await expect(DailyLoginSvc.claim(USER, NOW)).rejects.toThrow("db down");
  });
});
