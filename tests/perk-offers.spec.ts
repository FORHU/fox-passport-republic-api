import { describe, it, expect, vi, beforeEach } from "vitest";
import { liveCode } from "../src/modules/perk/perk.code";

const repo = vi.hoisted(() => ({
  listOffered: vi.fn(),
  findEventForOffer: vi.fn(),
  findVenueForOffer: vi.fn(),
  createPerk: vi.fn(),
  listIssued: vi.fn(),
  deactivate: vi.fn(),
  findReadyForPerk: vi.fn(),
  findPerk: vi.fn(),
  findByCode: vi.fn(),
  findBookingForCheck: vi.fn(),
  findVenueName: vi.fn(),
  markUsed: vi.fn(),
  findRedemption: vi.fn(),
  returnRedemption: vi.fn(),
}));

const access = vi.hoisted(() => ({
  canOnEvent: vi.fn(),
  canOnVenue: vi.fn(),
}));

vi.mock("../src/modules/perk/perk.repository", () => {
  class PerkRedeemError extends Error {}
  return { default: repo, PerkRedeemError };
});

vi.mock("../src/modules/reward/reward.repository", () => ({
  default: {
    getCoinsBalance: vi.fn(async () => 1240),
    getPendingCoins: vi.fn(async () => 0),
  },
}));

vi.mock("../src/modules/appointment/appointment.access", () => ({
  default: access,
  isEventOwner: (e: { organizerId: string } | null, u: string) =>
    !!e && e.organizerId === u,
  isVenueMayor: (v: { mayorId: string } | null, u: string) =>
    !!v && v.mayorId === u,
}));

import PerkSvc from "../src/modules/perk/perk.service";

const NOW = new Date("2026-11-18T10:00:10.000Z");
const SECRET = "s".repeat(32);
const CODE = "FP-AAAA-BBBB";

const perkRow = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  issuerType: "host",
  issuerUserId: "host1",
  venueId: null,
  eventId: "e1",
  title: "Free welcome drink",
  description: null,
  worthPhp: 100,
  tokenCost: 500,
  quantity: 10,
  remaining: 10,
  validDays: 30,
  active: true,
  ...over,
});

beforeEach(() => {
  Object.values(repo).forEach((f) => f.mockReset());
  Object.values(access).forEach((f) => f.mockReset());
});

describe("PerkSvc.create", () => {
  const input = {
    eventId: "e1",
    title: "  Free welcome drink ",
    description: "One drink",
    worthPhp: 100,
    quantity: 10,
  };

  beforeEach(() => {
    repo.findEventForOffer.mockResolvedValue({
      id: "e1",
      name: "Garden wedding",
      organizerId: "host1",
      endAt: new Date(NOW.getTime() + 86_400_000),
    });
    repo.createPerk.mockImplementation(async (d) => perkRow(d));
  });

  it("prices a host's perk from its peso value at 5 Tokens to the peso", async () => {
    const out = await PerkSvc.create("host1", input, NOW);

    expect(out.tokenCost).toBe(500);
    expect(repo.createPerk).toHaveBeenCalledWith(
      expect.objectContaining({
        issuerType: "host",
        issuerUserId: "host1",
        eventId: "e1",
        venueId: null,
        title: "Free welcome drink",
        quantity: 10,
        tokenCost: 500,
      }),
    );
  });

  it("lets a Mayor offer a perk at their own venue", async () => {
    repo.findVenueForOffer.mockResolvedValue({
      id: "v1",
      name: "Sky Hall",
      mayorId: "mayor1",
    });

    await PerkSvc.create(
      "mayor1",
      { venueId: "v1", title: "Starter", worthPhp: 160, quantity: 5 },
      NOW,
    );

    expect(repo.createPerk).toHaveBeenCalledWith(
      expect.objectContaining({
        issuerType: "venue",
        venueId: "v1",
        eventId: null,
        tokenCost: 800,
      }),
    );
  });

  it("is a 404 for an event that is not theirs", async () => {
    await expect(PerkSvc.create("someone", input, NOW)).rejects.toMatchObject({
      status: 404,
    });
    expect(repo.createPerk).not.toHaveBeenCalled();
  });

  it("is a 404 for a venue that is not theirs", async () => {
    repo.findVenueForOffer.mockResolvedValue({
      id: "v1",
      name: "Sky Hall",
      mayorId: "mayor1",
    });

    await expect(
      PerkSvc.create(
        "other",
        { venueId: "v1", title: "x", worthPhp: 10, quantity: 1 },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an event that is over", async () => {
    repo.findEventForOffer.mockResolvedValue({
      id: "e1",
      name: "Old",
      organizerId: "host1",
      endAt: new Date(NOW.getTime() - 1000),
    });

    await expect(PerkSvc.create("host1", input, NOW)).rejects.toMatchObject({
      status: 400,
      code: "EVENT_OVER",
    });
  });

  it.each([
    ["both an event and a venue", { eventId: "e1", venueId: "v1" }],
    ["neither", { eventId: undefined }],
    ["an empty title", { title: "  " }],
    ["a title over 80 characters", { title: "x".repeat(81) }],
    ["a zero worth", { worthPhp: 0 }],
    ["a worth that is not a number", { worthPhp: "lots" }],
    ["a huge worth", { worthPhp: 100_001 }],
    ["no quantity", { quantity: 0 }],
    ["a fractional quantity", { quantity: 1.5 }],
  ])("refuses %s", async (_name, over) => {
    await expect(
      PerkSvc.create("host1", { ...input, ...over }, NOW),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.createPerk).not.toHaveBeenCalled();
  });
});

describe("PerkSvc.list with an event", () => {
  it("passes the event through to the query", async () => {
    repo.listOffered.mockResolvedValue([]);

    await PerkSvc.list("u1", "e1");

    expect(repo.listOffered).toHaveBeenCalledWith("e1");
  });
});

describe("PerkSvc.takeDown", () => {
  it("stops the offer and returns the Tokens of everyone holding it unused", async () => {
    repo.findPerk.mockResolvedValue(perkRow());
    repo.deactivate.mockResolvedValue(true);
    repo.findReadyForPerk.mockResolvedValue([
      { id: "r1", userId: "u1", tokensSpent: 500, code: "FP-1" },
      { id: "r2", userId: "u2", tokensSpent: 500, code: "FP-2" },
    ]);
    repo.returnRedemption.mockResolvedValue(true);

    const out = await PerkSvc.takeDown("host1", "p1");

    expect(out).toEqual({ perkId: "p1", returned: 2, tokens: 1000 });
    expect(repo.returnRedemption.mock.calls[0][0]).toMatchObject({
      why: "perk_removed",
    });
  });

  it("is a 404 for someone else's perk", async () => {
    repo.findPerk.mockResolvedValue(perkRow());

    await expect(PerkSvc.takeDown("other", "p1")).rejects.toMatchObject({
      status: 404,
    });
    expect(repo.deactivate).not.toHaveBeenCalled();
  });

  it("counts a perk another run already returned as nothing", async () => {
    repo.findPerk.mockResolvedValue(perkRow());
    repo.deactivate.mockResolvedValue(false);
    repo.findReadyForPerk.mockResolvedValue([
      { id: "r1", userId: "u1", tokensSpent: 500, code: "FP-1" },
    ]);
    repo.returnRedemption.mockResolvedValue(false);

    expect(await PerkSvc.takeDown("host1", "p1")).toEqual({
      perkId: "p1",
      returned: 0,
      tokens: 0,
    });
  });
});

describe("PerkSvc.check and markUsed", () => {
  const redemption = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    userId: "u1",
    bookingId: "b1",
    code: CODE,
    codeSecret: SECRET,
    status: "ready",
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    usedAt: null,
    perk: perkRow({ venueId: "v1" }),
    user: { name: "Maria Santos" },
    ...over,
  });

  beforeEach(() => {
    repo.findByCode.mockResolvedValue(redemption());
    repo.findRedemption.mockResolvedValue(redemption());
    repo.findBookingForCheck.mockResolvedValue({
      id: "b1",
      eventId: "e1",
      startAt: NOW,
      event: { name: "Garden wedding" },
    });
    repo.findVenueName.mockResolvedValue("Sky Hall");
    access.canOnEvent.mockResolvedValue(true);
    access.canOnVenue.mockResolvedValue(false);
  });

  it("says a ready perk is valid, with the guest's first name and booking", async () => {
    const out = await PerkSvc.check("staff", { code: "fp-aaaa-bbbb" }, NOW);

    expect(out).toMatchObject({
      result: "valid",
      redemptionId: "r1",
      guestFirstName: "Maria",
      perk: { title: "Free welcome drink" },
      booking: { name: "Garden wedding" },
    });
  });

  it("accepts a fresh scanned live code", async () => {
    const live = liveCode(SECRET, CODE, NOW);

    const out = await PerkSvc.check("staff", { live }, NOW);

    expect(out.result).toBe("valid");
  });

  it("refuses a live code from an old window", async () => {
    const live = liveCode(SECRET, CODE, new Date(NOW.getTime() - 120_000));

    await expect(PerkSvc.check("staff", { live }, NOW)).rejects.toMatchObject({
      status: 409,
      code: "PERK_CODE_STALE",
    });
  });

  it("refuses a live code with a forged signature", async () => {
    await expect(
      PerkSvc.check("staff", { live: `${CODE}.1.forged` }, NOW),
    ).rejects.toMatchObject({ code: "PERK_CODE_STALE" });
  });

  it("is a 404 for a code that matches nothing", async () => {
    repo.findByCode.mockResolvedValue(null);

    await expect(PerkSvc.check("staff", { code: "FP-X" }, NOW)).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("is a 403 for someone who is not staff for it", async () => {
    access.canOnEvent.mockResolvedValue(false);
    access.canOnVenue.mockResolvedValue(false);

    await expect(PerkSvc.check("nobody", { code: CODE }, NOW)).rejects.toMatchObject(
      { status: 403 },
    );
  });

  it("lets the venue's own staff check a venue perk", async () => {
    access.canOnEvent.mockResolvedValue(false);
    access.canOnVenue.mockResolvedValue(true);

    const out = await PerkSvc.check("mayor", { code: CODE }, NOW);

    expect(out.result).toBe("valid");
    expect(access.canOnVenue).toHaveBeenCalledWith("v1", "mayor", "booking:check-in");
  });

  it("says a used perk is used, with when and where", async () => {
    const usedAt = new Date("2026-11-18T09:00:00.000Z");
    repo.findByCode.mockResolvedValue(redemption({ status: "used", usedAt }));

    const out = await PerkSvc.check("staff", { code: CODE }, NOW);

    expect(out).toMatchObject({ result: "used", usedAt, venueName: "Sky Hall" });
  });

  it.each([
    ["returned", {}],
    ["ready", { expiresAt: new Date(NOW.getTime() - 1000) }],
  ])("says a %s perk past use is expired", async (status, over) => {
    repo.findByCode.mockResolvedValue(redemption({ status, ...over }));

    const out = await PerkSvc.check("staff", { code: CODE }, NOW);

    expect(out.result).toBe("expired");
  });

  it("marks a ready perk used once", async () => {
    repo.markUsed.mockResolvedValue(true);

    const out = await PerkSvc.markUsed("staff", "r1", NOW);

    expect(out).toEqual({ redemptionId: "r1", usedAt: NOW });
    expect(repo.markUsed).toHaveBeenCalledWith("r1", "staff", NOW);
  });

  it("refuses a second use", async () => {
    repo.markUsed.mockResolvedValue(false);
    repo.findRedemption.mockResolvedValue(redemption({ status: "used" }));

    await expect(PerkSvc.markUsed("staff", "r1", NOW)).rejects.toMatchObject({
      status: 409,
      code: "PERK_ALREADY_USED",
    });
  });

  it("refuses to use a perk that is no longer ready", async () => {
    repo.markUsed.mockResolvedValue(false);

    await expect(PerkSvc.markUsed("staff", "r1", NOW)).rejects.toMatchObject({
      status: 409,
      code: "PERK_NOT_READY",
    });
  });

  it("does not let an unauthorised person mark a perk used", async () => {
    access.canOnEvent.mockResolvedValue(false);

    await expect(PerkSvc.markUsed("nobody", "r1", NOW)).rejects.toMatchObject({
      status: 403,
    });
    expect(repo.markUsed).not.toHaveBeenCalled();
  });
});
