import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserPath, RewardLifecycleType, Prisma } from "@prisma/client";
import RewardService from "../src/modules/reward/reward.service";
import RewardRepo from "../src/modules/reward/reward.repository";
import PassportRepo from "../src/modules/passport/passport.repository";
import PricingSvc from "../src/modules/pricing/pricing.service";

// Mock DB state
const mockDb = vi.hoisted(() => ({
  rewards: new Map<string, any>(),
  redemptions: new Map<string, any>(),
  events: new Map<string, any>(),
  lifecycles: [] as any[],
  passports: new Map<string, any>(),
  promotions: new Map<string, any>(),
  vouchers: new Map<string, any>(),
}));

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    coinReward: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return mockDb.rewards.get(where.id) || null;
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        const matches: any[] = [];
        for (const r of mockDb.rewards.values()) {
          if (where.active !== undefined && r.active !== where.active) continue;
          if (where.OR) {
            const audienceMatch = where.OR.some(
              (cond: any) => cond.targetAudience === r.targetAudience,
            );
            if (!audienceMatch) continue;
          }
          matches.push(r);
        }
        return matches;
      }),
    },
    coinRedemption: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `red-${Date.now()}-${Math.random()}`, ...data };
        mockDb.redemptions.set(row.id, row);
        return row;
      }),
    },
    promotion: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `promo-${Date.now()}-${Math.random()}`, ...data };
        mockDb.promotions.set(row.id, row);
        return row;
      }),
    },
    voucher: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `vch-${Date.now()}-${Math.random()}`, ...data };
        mockDb.vouchers.set(row.code, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => {
        const v = mockDb.vouchers.get(where.code);
        if (!v) return null;
        const promo = mockDb.promotions.get(v.promotionId);
        return { ...v, promotion: promo };
      }),
      findMany: vi.fn(async () => []),
    },
    voucherRedemption: {
      count: vi.fn(async () => 0),
    },
    rewardEvent: {
      findMany: vi.fn(async ({ where }: { where: any }) => {
        const matches: any[] = [];
        for (const ev of mockDb.events.values()) {
          if (where.userId && ev.userId !== where.userId) continue;
          matches.push(ev);
        }
        return matches;
      }),
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        for (const ev of mockDb.events.values()) {
          if (where.userId && ev.userId !== where.userId) continue;
          return ev;
        }
        return null;
      }),
    },
    rewardLifecycle: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `lc-${Date.now()}-${Math.random()}`, ...data };
        mockDb.lifecycles.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where: any }) => {
        return mockDb.lifecycles.filter((l) => l.userId === where.userId);
      }),
    },
    passport: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        return mockDb.passports.get(where.userId) || null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const current = mockDb.passports.get(where.userId) || {
          userId: where.userId,
          coins: 0,
        };
        const coins = data.coins?.decrement
          ? current.coins - data.coins.decrement
          : data.coins !== undefined
            ? data.coins
            : current.coins;
        const updated = { ...current, coins };
        mockDb.passports.set(where.userId, updated);
        return updated;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      // Execute the callback against mocked prisma methods
      const { prisma } = await import("../src/utils/prisma");
      return cb(prisma);
    }),
  },
}));

describe("Reward Service & Redemption Engine (Phase 2)", () => {
  beforeEach(() => {
    mockDb.rewards.clear();
    mockDb.redemptions.clear();
    mockDb.events.clear();
    mockDb.lifecycles.length = 0;
    mockDb.passports.clear();
    mockDb.promotions.clear();
    mockDb.vouchers.clear();

    // Seed default mock rewards
    mockDb.rewards.set("rwd-20", {
      id: "rwd-20",
      title: "₱20 Booking Discount",
      description: "Save ₱20 on booking of ₱1,000+",
      targetAudience: "citizen",
      coinCost: 100,
      rewardType: "booking_voucher",
      discountPhp: new Prisma.Decimal(20.0),
      discountPercentage: null,
      minLevel: 1,
      active: true,
    });

    mockDb.rewards.set("rwd-50", {
      id: "rwd-50",
      title: "₱50 Booking Discount",
      description: "Save ₱50 on booking of ₱2,500+",
      targetAudience: "citizen",
      coinCost: 250,
      rewardType: "booking_voucher",
      discountPhp: new Prisma.Decimal(50.0),
      discountPercentage: null,
      minLevel: 3,
      active: true,
    });

    mockDb.rewards.set("rwd-fox-10", {
      id: "rwd-fox-10",
      title: "10% Platform Fee Discount",
      description: "Reduce fee by 10%",
      targetAudience: "foxer",
      coinCost: 200,
      rewardType: "fee_discount",
      discountPhp: null,
      discountPercentage: new Prisma.Decimal(10.0),
      minLevel: 5,
      active: true,
    });
  });

  describe("getCatalog", () => {
    it("returns audience-scoped catalog with canAfford and no level lock", async () => {
      mockDb.passports.set("user-1", {
        userId: "user-1",
        coins: 150,
        paths: [{ path: UserPath.user, level: 2 }],
      });

      const catalog = await RewardService.getCatalog(
        "user-1",
        "citizen",
        UserPath.user,
      );

      expect(catalog).toHaveLength(2);

      const rwd20 = catalog.find((c) => c.id === "rwd-20");
      expect(rwd20).toBeDefined();
      expect(rwd20?.canAfford).toBe(true); // 150 >= 100
      expect(rwd20).not.toHaveProperty("levelQualified");
      expect(rwd20).not.toHaveProperty("minLevel");

      const rwd50 = catalog.find((c) => c.id === "rwd-50");
      expect(rwd50).toBeDefined();
      expect(rwd50?.canAfford).toBe(false); // 150 < 250
    });
  });

  describe("getWallet", () => {
    it("returns spendable coins and transaction history, without level, rank or XP", async () => {
      mockDb.passports.set("user-1", {
        userId: "user-1",
        coins: 350,
        paths: [{ path: UserPath.user, level: 5 }],
      });

      mockDb.events.set("ev-1", {
        id: "ev-1",
        userId: "user-1",
        action: "attend_event",
        xp: 100,
        coins: 40,
        refType: "booking",
        refId: "bkg-1",
        createdAt: new Date("2026-11-05T08:00:00Z"),
      });

      mockDb.lifecycles.push({
        id: "lc-1",
        userId: "user-1",
        type: RewardLifecycleType.REDEMPTION,
        coinsDelta: -100,
        reason: "Redeemed ₱20 Booking Discount",
        createdAt: new Date("2026-11-05T09:00:00Z"),
      });

      const wallet = await RewardService.getWallet("user-1", UserPath.user);

      expect(wallet.coins).toBe(350);
      expect(wallet).not.toHaveProperty("level");
      expect(wallet).not.toHaveProperty("rank");
      expect(wallet.history).toHaveLength(2);
      expect(wallet.history[0].type).toBe("lifecycle"); // newer
      expect(wallet.history[1].type).toBe("grant");
      expect(wallet.history[1]).not.toHaveProperty("xp");
    });

    it("shows the grant's booking on a release or reversal, not on a redemption or voucher return", async () => {
      mockDb.passports.set("user-2", {
        userId: "user-2",
        coins: 100,
        paths: [{ path: UserPath.user, level: 1 }],
      });
      const grantEvent = {
        refType: "booking",
        refId: "bkg-9",
      };
      mockDb.lifecycles.push(
        {
          id: "lc-rel",
          userId: "user-2",
          type: RewardLifecycleType.RELEASE,
          coinsDelta: 40,
          reason: "Released after the first attended paid booking",
          grantEvent,
          createdAt: new Date("2026-11-05T10:00:00Z"),
        },
        {
          id: "lc-ret",
          userId: "user-2",
          type: RewardLifecycleType.VOUCHER_RETURN,
          coinsDelta: 100,
          reason: "VOUCHER_EXPIRED: Tokens returned for unused voucher RWD-X",
          grantEvent,
          createdAt: new Date("2026-11-06T10:00:00Z"),
        },
      );

      const wallet = await RewardService.getWallet("user-2", UserPath.user);
      const release = wallet.history.find((h) => h.id === "lc-rel");
      const ret = wallet.history.find((h) => h.id === "lc-ret");

      expect(release).toMatchObject({ refType: "booking", refId: "bkg-9" });
      expect(release).not.toHaveProperty("action");
      expect(ret).toMatchObject({
        lifecycleType: "VOUCHER_RETURN",
        coinsDelta: 100,
      });
      expect(ret).not.toHaveProperty("refId");
    });
  });

  describe("redeem", () => {
    it("rejects redemption when coins balance is insufficient", async () => {
      mockDb.passports.set("user-poor", {
        userId: "user-poor",
        coins: 50,
        paths: [{ path: UserPath.user, level: 5 }],
      });

      await expect(
        RewardService.redeem({
          userId: "user-poor",
          rewardId: "rwd-20",
        }),
      ).rejects.toThrow("Insufficient coins");
    });

    it("redeems a reward whatever the level (no minLevel lock)", async () => {
      mockDb.passports.set("user-low", {
        userId: "user-low",
        coins: 1000,
        paths: [{ path: UserPath.user, level: 1 }],
      });

      const result = await RewardService.redeem({
        userId: "user-low",
        rewardId: "rwd-50", // minLevel 3 in the catalog row, no longer checked
      });

      expect(result.success).toBe(true);
    });

    it("deducts coins, records REDEMPTION lifecycle, and creates an owner-scoped voucher", async () => {
      mockDb.passports.set("user-ready", {
        userId: "user-ready",
        coins: 500,
        paths: [{ path: UserPath.user, level: 3 }],
      });

      mockDb.events.set("ev-ready", {
        id: "ev-ready",
        userId: "user-ready",
        action: "book_event",
        xp: 50,
        coins: 0,
        createdAt: new Date(),
      });

      const result = await RewardService.redeem({
        userId: "user-ready",
        rewardId: "rwd-50",
      });

      expect(result.success).toBe(true);
      expect(result.coinsSpent).toBe(250);
      expect(result.remainingCoins).toBe(250);
      expect(result.voucher.code).toMatch(/^RWD-[0-9A-F]{8}$/);
      expect(result.voucher.discountPhp).toBe(50);

      // Verify Passport coins decremented in DB
      const updatedPassport = mockDb.passports.get("user-ready");
      expect(updatedPassport.coins).toBe(250);

      // Verify Voucher in DB has ownerUserId set
      const createdVoucher = mockDb.vouchers.get(result.voucher.code);
      expect(createdVoucher).toBeDefined();
      expect(createdVoucher.ownerUserId).toBe("user-ready");

      // Verify Promotion has minSubtotal enforcing 50% platform fee limit
      // ₱50 discount / 0.025 = ₱2,000 minSubtotal
      const promo = mockDb.promotions.get(createdVoucher.promotionId);
      expect(promo.minSubtotal.toNumber()).toBe(2000);

      // Verify REDEMPTION lifecycle record
      const redemptionLc = mockDb.lifecycles.find(
        (l) => l.type === RewardLifecycleType.REDEMPTION,
      );
      expect(redemptionLc).toBeDefined();
      expect(redemptionLc?.coinsDelta).toBe(-250);
    });

    it("prevents other users from applying an owner-scoped voucher", async () => {
      mockDb.passports.set("user-owner", {
        userId: "user-owner",
        coins: 500,
        paths: [{ path: UserPath.user, level: 3 }],
      });

      const result = await RewardService.redeem({
        userId: "user-owner",
        rewardId: "rwd-20",
      });

      const code = result.voucher.code;

      // 1. Owner applying own voucher should succeed
      const ownerValidation = await PricingSvc.validateAndCalculateVoucher(
        code,
        1500,
        { userId: "user-owner" } as any,
      );
      expect(ownerValidation.discountAmount).toBe(20);

      // 2. Stranger applying owner's voucher should be rejected
      await expect(
        PricingSvc.validateAndCalculateVoucher(code, 1500, {
          userId: "user-stranger",
        } as any),
      ).rejects.toThrow("Voucher belongs to another user.");
    });
  });
});
