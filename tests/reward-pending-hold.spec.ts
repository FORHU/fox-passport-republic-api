import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserPath } from "@prisma/client";
import RewardService, {
  HELD_ACTIONS,
} from "../src/modules/reward/reward.service";
import RewardRepo from "../src/modules/reward/reward.repository";

// In-memory database state.
const db = vi.hoisted(() => ({
  rules: new Map<string, any>(),
  events: new Map<string, any>(),
  lifecycles: [] as any[],
  passports: new Map<string, any>(),
  seq: 0,
}));

/** An action filter as Prisma takes it: a name, or { not: name }. */
function actionMatches(ev: any, action: any): boolean {
  if (action === undefined) return true;
  if (typeof action === "string") return ev.action === action;
  if (action.not !== undefined) return ev.action !== action.not;
  if (action.notIn !== undefined) return !action.notIn.includes(ev.action);
  return true;
}

/** Grants whose Coins are held: what RewardRepo asks for. */
function held(where: any) {
  const blocked: string[] = where.lifecycles.none.type.in;
  return [...db.events.values()].filter(
    (ev) =>
      ev.userId === where.userId &&
      ev.coins > 0 &&
      actionMatches(ev, where.action) &&
      !db.lifecycles.some(
        (l) => l.grantEventId === ev.id && blocked.includes(l.type),
      ),
  );
}

function matches(ev: any, where: any): boolean {
  if (where.id && ev.id !== where.id) return false;
  if (where.lifecycles) {
    const blocked: string[] = where.lifecycles.none.type.in;
    const done = db.lifecycles.some(
      (l) => l.grantEventId === ev.id && blocked.includes(l.type),
    );
    if (done) return false;
  }
  if (where.userId && ev.userId !== where.userId) return false;
  if (!actionMatches(ev, where.action)) return false;
  if (where.refType && ev.refType !== where.refType) return false;
  if (where.refId && ev.refId !== where.refId) return false;
  if (where.coins?.gt !== undefined && !(ev.coins > where.coins.gt))
    return false;
  return true;
}

function lifecycleFind(where: any) {
  return (
    db.lifecycles.find(
      (l) =>
        (!where.grantEventId || l.grantEventId === where.grantEventId) &&
        (!where.type || l.type === where.type),
    ) ?? null
  );
}

function passportOf(userId: string) {
  return db.passports.get(userId) ?? { userId, coins: 0 };
}

function upsertPassport({ where, create, update }: any) {
  const current = passportOf(where.userId);
  const coins = update.coins?.increment
    ? current.coins + update.coins.increment
    : (create.coins ?? 0);
  const next = { ...current, coins };
  db.passports.set(where.userId, next);
  return next;
}

function eventApi() {
  return {
    create: vi.fn(async ({ data }: any) => {
      const ev = { id: `ev-${++db.seq}`, createdAt: new Date(), ...data };
      db.events.set(ev.id, ev);
      return ev;
    }),
    findMany: vi.fn(async ({ where }: any) =>
      where.lifecycles
        ? held(where)
        : [...db.events.values()].filter((e) => matches(e, where)),
    ),
    findFirst: vi.fn(async ({ where }: any) => {
      for (const ev of db.events.values()) {
        if (matches(ev, where)) return ev;
      }
      return null;
    }),
  };
}

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    rewardRule: {
      findUnique: vi.fn(
        async ({ where }: any) => db.rules.get(where.action) ?? null,
      ),
    },
    rewardEvent: {
      ...(() => {
        const api = eventApi();
        return api;
      })(),
      findUnique: vi.fn(async ({ where }: any) => {
        for (const ev of db.events.values()) {
          if (ev.idempotencyKey === where.idempotencyKey) return ev;
        }
        return null;
      }),
      findFirst: vi.fn(async ({ where }: any) => {
        for (const ev of db.events.values()) {
          if (matches(ev, where)) return ev;
        }
        return null;
      }),
      count: vi.fn(async ({ where }: any) => {
        let n = 0;
        for (const ev of db.events.values()) {
          if (ev.userId === where.userId && ev.action === where.action) n++;
        }
        return n;
      }),
    },
    rewardLifecycle: {
      findFirst: vi.fn(async ({ where }: any) => lifecycleFind(where)),
      // Like Prisma's `include: { grantEvent }`, attach each row's grant.
      findMany: vi.fn(async ({ where }: any) =>
        db.lifecycles
          .filter((l) => l.userId === where.userId)
          .map((l) => ({ ...l, grantEvent: db.events.get(l.grantEventId) })),
      ),
    },
    passport: {
      findUnique: vi.fn(
        async ({ where }: any) => db.passports.get(where.userId) ?? null,
      ),
      upsert: vi.fn(async (args: any) => upsertPassport(args)),
      update: vi.fn(async ({ where, data }: any) => {
        const next = { ...passportOf(where.userId), ...data };
        db.passports.set(where.userId, next);
        return next;
      }),
    },
    $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) =>
      cb({
        rewardEvent: eventApi(),
        rewardLifecycle: {
          create: vi.fn(async ({ data }: any) => {
            const lc = { id: `lc-${++db.seq}`, createdAt: new Date(), ...data };
            db.lifecycles.push(lc);
            return lc;
          }),
          findFirst: vi.fn(async ({ where }: any) => lifecycleFind(where)),
        },
        passport: {
          upsert: vi.fn(async (args: any) => upsertPassport(args)),
          findUnique: vi.fn(
            async ({ where }: any) => db.passports.get(where.userId) ?? null,
          ),
          update: vi.fn(async ({ where, data }: any) => {
            const next = { ...passportOf(where.userId), ...data };
            db.passports.set(where.userId, next);
            return next;
          }),
        },
      }),
    ),
  },
}));

vi.mock("../src/modules/passport/passport.service", () => ({
  default: { awardXP: vi.fn(async () => undefined) },
}));

vi.mock("../src/modules/passport/passport.repository", () => ({
  default: {
    findByUserId: vi.fn(async (userId: string) => ({
      ...passportOf(userId),
      paths: [{ path: UserPath.user, level: 1, totalXP: 0 }],
    })),
  },
}));

const rule = (
  action: string,
  xp: number,
  coins: number,
  extra: Record<string, unknown> = {},
) => ({
  id: `rule-${action}`,
  action,
  xp,
  coins,
  dailyCap: null,
  onceOnly: false,
  active: true,
  ...extra,
});

const u = "user-1";

const coinsOf = (userId = u) => passportOf(userId).coins;

async function intro() {
  return RewardService.grant({
    userId: u,
    action: "finish_intro",
    refType: "onboarding",
    refId: "intro",
  });
}

async function attend(bookingId: string, fee: number) {
  return RewardService.grant({
    userId: u,
    action: "attend_event",
    refType: "booking",
    refId: bookingId,
    bookingFeeAmount: fee,
  });
}

describe("holding the one-time Coins until a paid booking is attended", () => {
  beforeEach(() => {
    db.rules.clear();
    db.events.clear();
    db.lifecycles.length = 0;
    db.passports.clear();
    db.seq = 0;
    for (const r of [
      rule("finish_intro", 50, 20, { onceOnly: true }),
      rule("complete_profile", 30, 10, { onceOnly: true }),
      rule("verify_identity", 100, 40, { onceOnly: true }),
      rule("attend_event", 100, 40),
      rule("post_feed", 15, 3, { dailyCap: 5 }),
    ]) {
      db.rules.set(r.action, r);
    }
  });

  it("names exactly the three one-time actions", () => {
    expect([...HELD_ACTIONS].sort()).toEqual([
      "complete_profile",
      "finish_intro",
      "verify_identity",
    ]);
  });

  describe("while no paid booking has been attended", () => {
    it("holds the Coins", async () => {
      const result = await intro();

      expect(result.coinsAwarded).toBe(20);
      // Not spendable, and no RELEASE yet.
      expect(coinsOf()).toBe(0);
      expect(db.lifecycles).toHaveLength(0);
      expect(await RewardService.getBalance(u)).toBe(0);
      expect(await RewardRepo.getPendingCoins(u)).toBe(20);
    });

    it("holds the profile and ID Coins too, 70 in all", async () => {
      await intro();
      await RewardService.grant({
        userId: u,
        action: "complete_profile",
        refType: "onboarding",
        refId: "profile_complete",
      });
      await RewardService.grant({
        userId: u,
        action: "verify_identity",
        refType: "onboarding",
        refId: "id_verified",
      });

      expect(await RewardRepo.getPendingCoins(u)).toBe(70);
      expect(coinsOf()).toBe(0);
    });

    it("never holds Coins from any other action", async () => {
      await RewardService.grant({
        userId: u,
        action: "post_feed",
        refType: "feed",
        refId: "p1",
      });

      expect(coinsOf()).toBe(3);
      expect(await RewardRepo.getPendingCoins(u)).toBe(0);
    });

    it("shows the held Coins as pending on the wallet, not as spendable", async () => {
      await intro();

      const wallet = await RewardService.getWallet(u);

      expect(wallet.pendingCoins).toBe(20);
      expect(wallet.coins).toBe(0);
    });

    it("marks held grants in the wallet history, and only those", async () => {
      await intro();
      await RewardService.grant({
        userId: u,
        action: "post_feed",
        refType: "feed",
        refId: "p1",
      });

      const wallet = await RewardService.getWallet(u);
      const byAction = Object.fromEntries(
        wallet.history.map((h) => [h.action, h.isPending]),
      );

      expect(byAction.finish_intro).toBe(true);
      expect(byAction.post_feed).toBe(false);
    });

    it("a repeat of the grant holds nothing more", async () => {
      await intro();
      await intro();

      expect(await RewardRepo.getPendingCoins(u)).toBe(20);
      expect(db.events.size).toBe(1);
    });
  });

  describe("on the first attended paid booking", () => {
    it("releases every held grant into the spendable balance", async () => {
      await intro();
      await RewardService.grant({
        userId: u,
        action: "complete_profile",
        refType: "onboarding",
        refId: "profile_complete",
      });

      await attend("b1", 100);

      // 20 + 10 held, plus the 40 the attendance itself paid.
      expect(coinsOf()).toBe(70);
      expect(await RewardRepo.getPendingCoins(u)).toBe(0);
      const releases = db.lifecycles.filter((l) => l.type === "RELEASE");
      // Two releases for the held grants and one for the attendance.
      expect(releases).toHaveLength(3);
      expect(
        releases.filter((r) => r.reason?.includes("first attended paid")),
      ).toHaveLength(2);
    });

    it("the wallet no longer calls them held once they are released", async () => {
      await intro();
      await attend("b1", 100);

      const wallet = await RewardService.getWallet(u);

      expect(wallet.pendingCoins).toBe(0);
      expect(wallet.history.every((h) => !h.isPending)).toBe(true);
    });

    it("does nothing for a free booking", async () => {
      await intro();

      await attend("b1", 0);

      expect(await RewardRepo.getPendingCoins(u)).toBe(20);
      // Only an attendance with no fee, so it paid nothing either.
      expect(coinsOf()).toBe(0);
    });

    it("releases only once: a later booking finds nothing held", async () => {
      await intro();
      await attend("b1", 100);
      const after = coinsOf();

      await attend("b2", 100);

      // Only the second attendance's own 40.
      expect(coinsOf()).toBe(after + 40);
      expect(
        db.lifecycles.filter((l) => l.reason?.includes("first attended paid")),
      ).toHaveLength(1);
    });

    it("a replay of the same attendance releases nothing twice", async () => {
      await intro();
      await attend("b1", 100);
      const after = coinsOf();

      await attend("b1", 100);

      expect(coinsOf()).toBe(after);
    });

    it("releases directly with the repository too, and only the held ones", async () => {
      await intro();
      db.passports.set(u, { userId: u, coins: 5 });

      const first = await RewardRepo.releasePendingGrants(u, "test");
      const second = await RewardRepo.releasePendingGrants(u, "test");

      expect(first).toEqual({ released: 1, coins: 20 });
      expect(second).toEqual({ released: 0, coins: 0 });
      expect(coinsOf()).toBe(25);
    });
  });

  describe("once a paid booking has been attended", () => {
    it("pays the one-time Coins at once, with nothing to wait for", async () => {
      await attend("b1", 100);
      const before = coinsOf();

      await intro();

      expect(coinsOf()).toBe(before + 20);
      expect(await RewardRepo.getPendingCoins(u)).toBe(0);
    });
  });

  describe("reversals", () => {
    it("reversing a held grant takes nothing from the balance and it is never released", async () => {
      const first = await intro();
      expect(first.coinsAwarded).toBe(20);
      db.passports.set(u, { userId: u, coins: 5 });

      const reversal = await RewardService.reverse({
        userId: u,
        action: "finish_intro",
        refType: "onboarding",
        refId: "intro",
      });

      expect(reversal.reversed).toBe(true);
      // The 5 Coins it never included are still there.
      expect(coinsOf()).toBe(5);

      await attend("b1", 100);
      // The reversed grant is not released; only the attendance's 40 arrives.
      expect(coinsOf()).toBe(45);
      expect(await RewardRepo.getPendingCoins(u)).toBe(0);
    });

    it("reversing a released grant still takes its Coins back", async () => {
      await attend("b1", 100);
      expect(coinsOf()).toBe(40);

      await RewardService.reverse({
        userId: u,
        action: "attend_event",
        refType: "booking",
        refId: "b1",
      });

      expect(coinsOf()).toBe(0);
    });
  });
});

describe("milestone tier grants are held and freed one at a time", () => {
  beforeEach(() => {
    db.rules.clear();
    db.events.clear();
    db.lifecycles.length = 0;
    db.passports.clear();
    db.seq = 0;
    for (const r of [
      rule("finish_intro", 50, 20, { onceOnly: true }),
      rule("attend_event", 100, 40),
    ]) {
      db.rules.set(r.action, r);
    }
  });

  const tier = (refId: string, tokens: number) =>
    RewardService.grant({
      userId: u,
      action: "milestone_tier",
      refType: "milestone_tier",
      refId,
      idempotencyKey: `milestone:${u}:${refId}`,
      coinsOverride: tokens,
      holdUntilAttended: true,
    });

  it("holds the Tokens as Pending, not in the balance", async () => {
    const out = await tier("booked_events:1", 10);
    expect(out.coinsAwarded).toBe(10);
    expect(coinsOf()).toBe(0);
    expect(await RewardRepo.getPendingCoins(u)).toBe(10);
  });

  it("an attended paid booking frees the one-time Coins but not a held tier", async () => {
    await intro(); // held one-time grant, 20
    await tier("booked_events:1", 10); // held tier grant, 10
    await attend("b1", 100); // frees the held one-time grants, and pays 40
    expect(coinsOf()).toBe(60); // 20 + 40, and not the tier's 10
    expect(await RewardRepo.getPendingCoins(u)).toBe(10);
  });

  it("releaseGrant frees that grant only", async () => {
    await tier("booked_events:1", 10);
    await tier("booked_events:2", 25);
    const first = [...db.events.values()].find(
      (e) => e.refId === "booked_events:1",
    )!;
    expect(await RewardRepo.releaseGrant(first.id, u, "attended")).toBe(true);
    expect(coinsOf()).toBe(10);
    expect(await RewardRepo.getPendingCoins(u)).toBe(25);
  });

  it("releaseGrant twice pays once", async () => {
    await tier("booked_events:1", 10);
    const ev = [...db.events.values()][0];
    await RewardRepo.releaseGrant(ev.id, u, "attended");
    expect(await RewardRepo.releaseGrant(ev.id, u, "attended")).toBe(false);
    expect(coinsOf()).toBe(10);
  });

  it("releaseGrant does nothing for a grant that was reversed", async () => {
    await tier("booked_events:1", 10);
    await RewardService.reverse({
      userId: u,
      action: "milestone_tier",
      refType: "milestone_tier",
      refId: "booked_events:1",
      reason: "cancelled",
    });
    const ev = [...db.events.values()][0];
    expect(await RewardRepo.releaseGrant(ev.id, u, "attended")).toBe(false);
    expect(coinsOf()).toBe(0);
  });

  it("listHeldByAction returns only that action's held grants", async () => {
    await intro();
    await tier("booked_events:1", 10);
    const rows = await RewardRepo.listHeldByAction(u, "milestone_tier");
    expect(rows.map((r) => r.refId)).toEqual(["booked_events:1"]);
  });
});
