import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserPath, RewardLifecycleType } from "@prisma/client";
import RewardService from "../src/modules/reward/reward.service";
import RewardRepo from "../src/modules/reward/reward.repository";
import PassportSvc from "../src/modules/passport/passport.service";
import PassportRepo from "../src/modules/passport/passport.repository";

// Mock database state
const mockDb = vi.hoisted(() => ({
  rules: new Map<string, any>(),
  events: new Map<string, any>(),
  lifecycles: [] as any[],
  passports: new Map<string, any>(),
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    rewardRule: {
      findUnique: vi.fn(async ({ where }: { where: { action: string } }) => {
        return mockDb.rules.get(where.action) || null;
      }),
    },
    rewardEvent: {
      findUnique: vi.fn(
        async ({ where }: { where: { idempotencyKey: string } }) => {
          for (const ev of mockDb.events.values()) {
            if (ev.idempotencyKey === where.idempotencyKey) return ev;
          }
          return null;
        },
      ),
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        for (const ev of mockDb.events.values()) {
          if (where.id && ev.id !== where.id) continue;
          if (where.userId && ev.userId !== where.userId) continue;
          if (where.refType && ev.refType !== where.refType) continue;
          if (where.refId && ev.refId !== where.refId) continue;
          if (where.action && ev.action !== where.action) continue;
          return ev;
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        const matches: any[] = [];
        for (const ev of mockDb.events.values()) {
          if (where.refType && ev.refType !== where.refType) continue;
          if (where.refId && ev.refId !== where.refId) continue;
          matches.push(ev);
        }
        return matches;
      }),
      count: vi.fn(async ({ where }: { where: any }) => {
        let count = 0;
        for (const ev of mockDb.events.values()) {
          if (ev.userId !== where.userId) continue;
          if (ev.action !== where.action) continue;
          if (where.createdAt?.gte && ev.createdAt < where.createdAt.gte)
            continue;
          count++;
        }
        return count;
      }),
    },
    rewardLifecycle: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        return (
          mockDb.lifecycles.find(
            (l) =>
              (!where.grantEventId || l.grantEventId === where.grantEventId) &&
              (!where.type || l.type === where.type),
          ) || null
        );
      }),
    },
    passport: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        return mockDb.passports.get(where.userId) || null;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const current = mockDb.passports.get(where.userId) || {
          userId: where.userId,
          coins: 0,
        };
        const coins = update.coins?.increment
          ? current.coins + update.coins.increment
          : create.coins || 0;
        const updated = { ...current, coins };
        mockDb.passports.set(where.userId, updated);
        return updated;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const current = mockDb.passports.get(where.userId) || {
          userId: where.userId,
          coins: 0,
        };
        const updated = { ...current, ...data };
        mockDb.passports.set(where.userId, updated);
        return updated;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb({
        rewardEvent: {
          create: vi.fn(async ({ data }: any) => {
            const ev = { id: `ev-${Date.now()}-${Math.random()}`, ...data };
            mockDb.events.set(ev.id, ev);
            return ev;
          }),
        },
        rewardLifecycle: {
          create: vi.fn(async ({ data }: any) => {
            const lc = { id: `lc-${Date.now()}-${Math.random()}`, ...data };
            mockDb.lifecycles.push(lc);
            return lc;
          }),
        },
        passport: {
          upsert: vi.fn(async ({ where, create, update }: any) => {
            const current = mockDb.passports.get(where.userId) || {
              userId: where.userId,
              coins: 0,
            };
            const coins = update.coins?.increment
              ? current.coins + update.coins.increment
              : create.coins || 0;
            const updated = { ...current, coins };
            mockDb.passports.set(where.userId, updated);
            return updated;
          }),
          findUnique: vi.fn(async ({ where }: any) => {
            return mockDb.passports.get(where.userId) || null;
          }),
          update: vi.fn(async ({ where, data }: any) => {
            const current = mockDb.passports.get(where.userId) || {
              userId: where.userId,
              coins: 0,
            };
            const updated = { ...current, ...data };
            mockDb.passports.set(where.userId, updated);
            return updated;
          }),
        },
      });
    }),
  },
}));

vi.mock("../src/modules/passport/passport.service", () => ({
  default: {
    awardXP: vi.fn(
      async (userId: string, path: UserPath, amount: number) => {
        const passport = mockDb.passports.get(userId) || {
          userId,
          coins: 0,
          paths: [],
        };
        let p = passport.paths?.find((it: any) => it.path === path);
        if (!p) {
          p = { path, totalXP: 0, level: 1 };
          passport.paths = passport.paths || [];
          passport.paths.push(p);
        }
        p.totalXP = Math.max(0, p.totalXP + amount);
        p.level = Math.max(1, Math.floor(p.totalXP / 1000) + 1);
        mockDb.passports.set(userId, passport);
      },
    ),
  },
}));

vi.mock("../src/modules/passport/passport.repository", () => ({
  default: {
    findByUserId: vi.fn(async (userId: string) => {
      return (
        mockDb.passports.get(userId) || {
          userId,
          coins: 0,
          paths: [{ path: UserPath.user, level: 1, totalXP: 0 }],
        }
      );
    }),
  },
}));

describe("RewardService & Immutable Ledger Foundation", () => {
  beforeEach(() => {
    mockDb.rules.clear();
    mockDb.events.clear();
    mockDb.lifecycles = [];
    mockDb.passports.clear();
    vi.clearAllMocks();

    // Seed default rules
    mockDb.rules.set("book_event", {
      action: "book_event",
      xp: 50,
      coins: 0,
      active: true,
      onceOnly: false,
    });
    mockDb.rules.set("attend_event", {
      action: "attend_event",
      xp: 100,
      coins: 40,
      active: true,
      onceOnly: false,
    });
    mockDb.rules.set("post_feed", {
      action: "post_feed",
      xp: 15,
      coins: 3,
      dailyCap: 1,
      active: true,
      onceOnly: false,
    });
    mockDb.rules.set("finish_intro", {
      action: "finish_intro",
      xp: 50,
      coins: 20,
      active: true,
      onceOnly: true,
    });
  });

  describe("Rank Ladder Resolution", () => {
    it("resolves citizen rank names correctly across level tiers", () => {
      expect(RewardService.calculateRank(1, UserPath.user)).toBe("Newcomer");
      expect(RewardService.calculateRank(3, UserPath.user)).toBe("Wanderer");
      expect(RewardService.calculateRank(5, UserPath.user)).toBe("Explorer");
      expect(RewardService.calculateRank(10, UserPath.user)).toBe("Trailblazer");
      expect(RewardService.calculateRank(15, UserPath.user)).toBe("Voyager");
      expect(RewardService.calculateRank(20, UserPath.user)).toBe("Adventurer");
      expect(RewardService.calculateRank(30, UserPath.user)).toBe("Pioneer");
      expect(RewardService.calculateRank(40, UserPath.user)).toBe("Vanguard");
      expect(RewardService.calculateRank(50, UserPath.user)).toBe("Legend");
    });

    it("resolves Foxer and Provider rank names correctly across level tiers", () => {
      expect(RewardService.calculateRank(1, UserPath.providerFoxer)).toBe(
        "Rookie",
      );
      expect(RewardService.calculateRank(5, UserPath.providerFoxer)).toBe("Pro");
      expect(RewardService.calculateRank(20, UserPath.providerFoxer)).toBe(
        "Maestro",
      );
      expect(RewardService.calculateRank(50, UserPath.providerFoxer)).toBe(
        "Legend",
      );
    });
  });

  describe("Reward Granting & Idempotency", () => {
    it("grants XP and Coins atomically and updates cached balance", async () => {
      const res = await RewardService.grant({
        userId: "user-1",
        action: "attend_event",
        refType: "booking",
        refId: "booking-1",
        bookingFeeAmount: 50, // ₱50 fee -> ₱20 budget = 100 Coins
      });

      expect(res.xpAwarded).toBe(100);
      expect(res.coinsAwarded).toBe(40);
      expect(res.isIdempotentReplay).toBeFalsy();

      const balance = await RewardService.getBalance("user-1");
      expect(balance).toBe(40);
      expect(PassportSvc.awardXP).toHaveBeenCalledWith(
        "user-1",
        UserPath.user,
        100,
      );
    });

    it("returns existing reward result without double-awarding on replay", async () => {
      const key = "grant:user-1:attend:b1";
      const first = await RewardService.grant({
        userId: "user-1",
        action: "attend_event",
        refType: "booking",
        refId: "b1",
        idempotencyKey: key,
        bookingFeeAmount: 100,
      });

      expect(first.coinsAwarded).toBe(40);

      const second = await RewardService.grant({
        userId: "user-1",
        action: "attend_event",
        refType: "booking",
        refId: "b1",
        idempotencyKey: key,
        bookingFeeAmount: 100,
      });

      expect(second.isIdempotentReplay).toBe(true);
      expect(second.coinsAwarded).toBe(40);

      // PassportSvc.awardXP called only once
      expect(PassportSvc.awardXP).toHaveBeenCalledTimes(1);
    });

    it("enforces once-only constraint on introductory rewards", async () => {
      const first = await RewardService.grant({
        userId: "user-intro",
        action: "finish_intro",
        refType: "user_onboarding",
        refId: "intro",
      });

      expect(first.xpAwarded).toBe(50);
      expect(first.coinsAwarded).toBe(20);

      const second = await RewardService.grant({
        userId: "user-intro",
        action: "finish_intro",
        refType: "user_onboarding",
        refId: "intro-repeat",
      });

      expect(second.xpAwarded).toBe(0);
      expect(second.coinsAwarded).toBe(0);
    });

    it("enforces daily cap on engagement actions", async () => {
      const first = await RewardService.grant({
        userId: "user-poster",
        action: "post_feed",
        refType: "post",
        refId: "post-1",
      });

      expect(first.xpAwarded).toBe(15);
      expect(first.coinsAwarded).toBe(3);

      const second = await RewardService.grant({
        userId: "user-poster",
        action: "post_feed",
        refType: "post",
        refId: "post-2",
      });

      // Daily cap is 1; second attempt awards 0
      expect(second.xpAwarded).toBe(0);
      expect(second.coinsAwarded).toBe(0);
    });
  });

  describe("Platform Fee Liability Budget Enforcement (40% Cap)", () => {
    it("awards 0 Coins on free bookings (₱0 platform fee)", async () => {
      const res = await RewardService.grant({
        userId: "user-free",
        action: "attend_event",
        refType: "booking",
        refId: "booking-free",
        bookingFeeAmount: 0,
      });

      expect(res.xpAwarded).toBe(100);
      expect(res.coinsAwarded).toBe(0);
    });

    it("strictly caps coins to 40% of collected platform fee across beneficiaries", async () => {
      // ₱25 platform fee -> 40% = ₱10 = 50 Coins maximum
      // First beneficiary takes 40 attend coins
      const res1 = await RewardService.grant({
        userId: "user-guest",
        action: "attend_event",
        refType: "booking",
        refId: "booking-small",
        bookingFeeAmount: 25,
      });
      expect(res1.coinsAwarded).toBe(40);

      // Second beneficiary tries to take 40 host coins, but only 10 Coins remain in budget
      const res2 = await RewardService.grant({
        userId: "user-host",
        path: UserPath.providerFoxer,
        action: "attend_event",
        refType: "booking",
        refId: "booking-small",
        bookingFeeAmount: 25,
      });
      expect(res2.coinsAwarded).toBe(10); // Trimmed to remaining 10 Coins

      // Third beneficiary gets 0 Coins (budget fully exhausted)
      const res3 = await RewardService.grant({
        userId: "user-third",
        action: "attend_event",
        refType: "booking",
        refId: "booking-small",
        bookingFeeAmount: 25,
      });
      expect(res3.coinsAwarded).toBe(0);
    });
  });

  describe("Append-Only Reversals", () => {
    it("creates an append-only reversal lifecycle event and reverses XP and Coins", async () => {
      await RewardService.grant({
        userId: "user-cancel",
        action: "attend_event",
        refType: "booking",
        refId: "b-cancel-1",
        bookingFeeAmount: 50,
      });

      const initialBalance = await RewardService.getBalance("user-cancel");
      expect(initialBalance).toBe(40);

      const rev = await RewardService.reverse({
        refType: "booking",
        refId: "b-cancel-1",
        reason: "Guest cancelled booking",
      });

      expect(rev.reversed).toBe(true);
      expect(rev.xpReversed).toBe(100);
      expect(rev.coinsReversed).toBe(40);

      // Balance decremented
      const finalBalance = await RewardService.getBalance("user-cancel");
      expect(finalBalance).toBe(0);

      // XP reversed via PassportSvc.awardXP with negative amount
      expect(PassportSvc.awardXP).toHaveBeenCalledWith(
        "user-cancel",
        UserPath.user,
        -100,
      );

      // Original grant event remains intact (immutable)
      const grant = await RewardRepo.findEventByRef("booking", "b-cancel-1");
      expect(grant?.xp).toBe(100);
      expect(grant?.coins).toBe(40);

      // Lifecycle contains REVERSAL record
      const lifecycle = mockDb.lifecycles.find(
        (l) => l.type === RewardLifecycleType.REVERSAL,
      );
      expect(lifecycle).toBeDefined();
      expect(lifecycle?.reversalOf).toBe(grant?.id);
    });

    it("prevents duplicate reversals on the same grant", async () => {
      await RewardService.grant({
        userId: "user-cancel",
        action: "attend_event",
        refType: "booking",
        refId: "b-double-rev",
        bookingFeeAmount: 50,
      });

      const firstRev = await RewardService.reverse({
        refType: "booking",
        refId: "b-double-rev",
      });
      expect(firstRev.reversed).toBe(true);

      const secondRev = await RewardService.reverse({
        refType: "booking",
        refId: "b-double-rev",
      });
      expect(secondRev.reversed).toBe(false);
    });
  });
});
