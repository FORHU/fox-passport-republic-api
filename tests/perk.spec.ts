import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  newPerkCode,
  newPerkSecret,
  liveCode,
  verifyLiveCode,
  windowOf,
  secondsLeftInWindow,
} from "../src/modules/perk/perk.code";

const repo = vi.hoisted(() => ({
  listOffered: vi.fn(),
  findPerk: vi.fn(),
  findEligibleBookings: vi.fn(),
  findBookingOf: vi.fn(),
  findHeld: vi.fn(),
  listMine: vi.fn(),
  findRedemption: vi.fn(),
  redeemTransaction: vi.fn(),
  findReady: vi.fn(),
  findCancelledBookingIds: vi.fn(),
  returnRedemption: vi.fn(),
}));

vi.mock("../src/modules/perk/perk.repository", () => {
  class PerkRedeemError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
    }
  }
  return { default: repo, PerkRedeemError };
});

vi.mock("../src/modules/reward/reward.repository", () => ({
  default: {
    getCoinsBalance: vi.fn(async () => 1240),
    getPendingCoins: vi.fn(async () => 120),
  },
}));

import PerkSvc from "../src/modules/perk/perk.service";
import { PerkRedeemError } from "../src/modules/perk/perk.repository";
import { AppError } from "../src/utils/errors";

const NOW = new Date("2026-11-18T10:00:10.000Z");

const perk = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  issuerType: "venue",
  venueId: "v1",
  templateId: null,
  title: "Free welcome drink",
  description: "One drink",
  worthPhp: 100,
  tokenCost: 500,
  quantity: 10,
  remaining: 3,
  validDays: 30,
  active: true,
  ...over,
});

beforeEach(() => {
  Object.values(repo).forEach((f) => f.mockReset());
});

describe("live code", () => {
  it("a text code is FP-XXXX-XXXX without look-alike characters", () => {
    for (let i = 0; i < 50; i++) {
      expect(newPerkCode()).toMatch(
        /^FP-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/,
      );
    }
  });

  it("is the same inside a 30 second window and changes in the next", () => {
    const secret = newPerkSecret();
    const code = "FP-AAAA-BBBB";
    const t = new Date("2026-11-18T10:00:00.000Z");
    const same = new Date(t.getTime() + 29_000);
    const next = new Date(t.getTime() + 30_000);

    expect(liveCode(secret, code, t)).toBe(liveCode(secret, code, same));
    expect(liveCode(secret, code, t)).not.toBe(liveCode(secret, code, next));
  });

  it("verifies in its window and the one after, not later", () => {
    const secret = newPerkSecret();
    const code = "FP-AAAA-BBBB";
    const t = new Date("2026-11-18T10:00:00.000Z");
    const live = liveCode(secret, code, t);

    expect(verifyLiveCode(secret, code, live, t)).toBe(true);
    expect(
      verifyLiveCode(secret, code, live, new Date(t.getTime() + 30_000)),
    ).toBe(true);
    expect(
      verifyLiveCode(secret, code, live, new Date(t.getTime() + 60_000)),
    ).toBe(false);
  });

  it("rejects a tampered code, another perk's secret and another code", () => {
    const secret = newPerkSecret();
    const code = "FP-AAAA-BBBB";
    const live = liveCode(secret, code, NOW);
    const forged = `${live.slice(0, -1)}${live.endsWith("0") ? "1" : "0"}`;

    expect(verifyLiveCode(secret, code, forged, NOW)).toBe(false);
    expect(verifyLiveCode(newPerkSecret(), code, live, NOW)).toBe(false);
    expect(verifyLiveCode(secret, "FP-CCCC-DDDD", live, NOW)).toBe(false);
    expect(verifyLiveCode(secret, code, "garbage", NOW)).toBe(false);
  });

  it("counts the seconds left in the window", () => {
    expect(windowOf(new Date(0))).toBe(0);
    expect(secondsLeftInWindow(new Date("2026-11-18T10:00:00.000Z"))).toBe(30);
    expect(secondsLeftInWindow(new Date("2026-11-18T10:00:29.000Z"))).toBe(1);
  });
});

describe("PerkSvc.list", () => {
  it("returns the spendable and held Tokens and how short each perk is", async () => {
    repo.listOffered.mockResolvedValue([
      perk(),
      perk({ id: "p2", tokenCost: 1500 }),
    ]);

    const out = await PerkSvc.list("u1");

    expect(out.balance).toBe(1240);
    expect(out.held).toBe(120);
    expect(out.perks.map((p) => [p.id, p.tokensShort])).toEqual([
      ["p1", 0],
      ["p2", 260],
    ]);
  });
});

describe("PerkSvc.detail", () => {
  it("lists only bookings the person has not already used this perk on", async () => {
    repo.findPerk.mockResolvedValue(perk());
    repo.findEligibleBookings.mockResolvedValue([
      { id: "b1", startAt: NOW, event: { name: "Night A" } },
      { id: "b2", startAt: NOW, event: { name: "Night B" } },
    ]);
    repo.findHeld.mockResolvedValue([{ perkId: "p1", bookingId: "b1" }]);

    const out = await PerkSvc.detail("u1", "p1", NOW);

    expect(out.bookings.map((b) => b.id)).toEqual(["b2"]);
  });

  it("is a 404 for a perk that is off", async () => {
    repo.findPerk.mockResolvedValue(perk({ active: false }));

    await expect(PerkSvc.detail("u1", "p1", NOW)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("PerkSvc.redeem", () => {
  beforeEach(() => {
    repo.findPerk.mockResolvedValue(perk());
    repo.findBookingOf.mockResolvedValue({ id: "b1" });
    repo.findEligibleBookings.mockResolvedValue([{ id: "b1" }]);
  });

  it("spends the Tokens, issues a code and a date 30 days out", async () => {
    repo.redeemTransaction.mockImplementation(async (d) => ({
      redemption: {
        id: "r1",
        code: d.code,
        tokensSpent: 500,
        expiresAt: d.expiresAt,
      },
      remainingCoins: 740,
    }));

    const out = await PerkSvc.redeem("u1", "p1", "b1", NOW);

    expect(out.tokensSpent).toBe(500);
    expect(out.remainingCoins).toBe(740);
    expect(out.code).toMatch(/^FP-/);
    expect(out.expiresAt.getTime() - NOW.getTime()).toBe(30 * 86_400_000);
    const sent = repo.redeemTransaction.mock.calls[0][0];
    expect(sent.secret).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses a sold-out perk before touching any Tokens", async () => {
    repo.findPerk.mockResolvedValue(perk({ remaining: 0 }));

    await expect(PerkSvc.redeem("u1", "p1", "b1", NOW)).rejects.toMatchObject({
      status: 409,
      code: "PERK_SOLD_OUT",
    });
    expect(repo.redeemTransaction).not.toHaveBeenCalled();
  });

  it("refuses a booking that is not the person's", async () => {
    repo.findBookingOf.mockResolvedValue(null);

    await expect(PerkSvc.redeem("u1", "p1", "bX", NOW)).rejects.toMatchObject({
      status: 404,
    });
    expect(repo.redeemTransaction).not.toHaveBeenCalled();
  });

  it("refuses a booking at another venue", async () => {
    repo.findEligibleBookings.mockResolvedValue([]);

    await expect(PerkSvc.redeem("u1", "p1", "b1", NOW)).rejects.toMatchObject({
      status: 400,
      code: "PERK_BOOKING_NOT_ELIGIBLE",
    });
    expect(repo.redeemTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["insufficient", 400, "INSUFFICIENT_TOKENS"],
    ["sold_out", 409, "PERK_SOLD_OUT"],
    ["already", 409, "PERK_ALREADY_REDEEMED"],
  ])("maps a %s claim to its answer", async (reason, status, code) => {
    repo.redeemTransaction.mockRejectedValue(new PerkRedeemError(reason as never));

    const err = await PerkSvc.redeem("u1", "p1", "b1", NOW).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ status, code });
  });
});

describe("PerkSvc.code", () => {
  const redemption = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    userId: "u1",
    code: "FP-AAAA-BBBB",
    codeSecret: "s".repeat(32),
    status: "ready",
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    perk: { title: "Free welcome drink" },
    ...over,
  });

  it("gives the owner the text code and a live code that verifies", async () => {
    repo.findRedemption.mockResolvedValue(redemption());

    const out = await PerkSvc.code("u1", "r1", NOW);

    expect(out.code).toBe("FP-AAAA-BBBB");
    expect(verifyLiveCode("s".repeat(32), out.code, out.live, NOW)).toBe(true);
    expect(out.refreshInSeconds).toBeGreaterThan(0);
  });

  it("is a 404 for someone else's perk", async () => {
    repo.findRedemption.mockResolvedValue(redemption({ userId: "other" }));

    await expect(PerkSvc.code("u1", "r1", NOW)).rejects.toMatchObject({
      status: 404,
    });
  });

  it.each([
    ["used", {}],
    ["returned", {}],
    ["ready", { expiresAt: new Date(NOW.getTime() - 1000) }],
  ])("is refused once it is %s", async (status, over) => {
    repo.findRedemption.mockResolvedValue(redemption({ status, ...over }));

    await expect(PerkSvc.code("u1", "r1", NOW)).rejects.toMatchObject({
      status: 409,
      code: "PERK_NOT_READY",
    });
  });
});

describe("PerkSvc.returnDue", () => {
  const ready = (id: string, bookingId: string, expiresAt: Date) => ({
    id,
    userId: "u1",
    bookingId,
    tokensSpent: 500,
    code: `FP-${id}`,
    expiresAt,
  });
  const future = new Date(NOW.getTime() + 86_400_000);
  const past = new Date(NOW.getTime() - 1000);

  it("returns expired perks and perks of cancelled bookings, and no others", async () => {
    repo.findReady.mockResolvedValue([
      ready("expired", "b1", past),
      ready("cancelled", "b2", future),
      ready("fine", "b3", future),
    ]);
    repo.findCancelledBookingIds.mockResolvedValue(new Set(["b2"]));
    repo.returnRedemption.mockResolvedValue(true);

    const out = await PerkSvc.returnDue(NOW);

    expect(out).toEqual({ returned: 2, tokens: 1000, failed: 0 });
    expect(
      repo.returnRedemption.mock.calls.map((c) => [c[0].redemptionId, c[0].why]),
    ).toEqual([
      ["expired", "expired"],
      ["cancelled", "booking_cancelled"],
    ]);
  });

  it("counts a perk another run already returned as nothing", async () => {
    repo.findReady.mockResolvedValue([ready("a", "b1", past)]);
    repo.findCancelledBookingIds.mockResolvedValue(new Set());
    repo.returnRedemption.mockResolvedValue(false);

    expect(await PerkSvc.returnDue(NOW)).toEqual({
      returned: 0,
      tokens: 0,
      failed: 0,
    });
  });

  it("logs one failure and carries on with the rest", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    repo.findReady.mockResolvedValue([
      ready("a", "b1", past),
      ready("b", "b2", past),
    ]);
    repo.findCancelledBookingIds.mockResolvedValue(new Set());
    repo.returnRedemption
      .mockRejectedValueOnce(new Error("db"))
      .mockResolvedValueOnce(true);

    const out = await PerkSvc.returnDue(NOW);

    expect(out).toEqual({ returned: 1, tokens: 500, failed: 1 });
    spy.mockRestore();
  });
});
