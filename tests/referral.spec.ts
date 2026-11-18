import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import ReferralRepo, {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
} from "../src/modules/referral/referral.repository";
import ReferralSvc, {
  generateReferralCode,
  normalizeReferralCode,
} from "../src/modules/referral/referral.service";
import { ReferralCtrl } from "../src/modules/referral/referral.controller";

const repo = {
  findCodeOf: vi.spyOn(ReferralRepo, "findCodeOf"),
  setCodeIfEmpty: vi.spyOn(ReferralRepo, "setCodeIfEmpty"),
  findOwnerOfCode: vi.spyOn(ReferralRepo, "findOwnerOfCode"),
  findReferralOf: vi.spyOn(ReferralRepo, "findReferralOf"),
  create: vi.spyOn(ReferralRepo, "create"),
  countFor: vi.spyOn(ReferralRepo, "countFor"),
  hasPaidBooking: vi.spyOn(ReferralRepo, "hasPaidBooking"),
};

const unique = () =>
  new Prisma.PrismaClientKnownRequestError("unique", {
    code: "P2002",
    clientVersion: "test",
  });

beforeEach(() => {
  for (const spy of Object.values(repo)) spy.mockReset();
});

describe("referral codes", () => {
  it("are 8 characters from an alphabet with no look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
      for (const ch of code) expect(REFERRAL_CODE_ALPHABET).toContain(ch);
    }
    for (const bad of ["0", "O", "1", "I", "L"]) {
      expect(REFERRAL_CODE_ALPHABET).not.toContain(bad);
    }
  });

  it("are not the same twice in a row", () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generateReferralCode()),
    );
    expect(codes.size).toBe(100);
  });

  it("are read as typed: no spaces or dashes, upper case", () => {
    expect(normalizeReferralCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeReferralCode("abcd 2345")).toBe("ABCD2345");
  });
});

describe("ReferralSvc.getOrCreateCode", () => {
  it("returns the code the account already has, and makes none", async () => {
    repo.findCodeOf.mockResolvedValue("ABCD2345");
    expect(await ReferralSvc.getOrCreateCode("u1")).toBe("ABCD2345");
    expect(repo.setCodeIfEmpty).not.toHaveBeenCalled();
  });

  it("makes one the first time", async () => {
    repo.findCodeOf.mockResolvedValue(null);
    repo.setCodeIfEmpty.mockResolvedValue(true);
    const code = await ReferralSvc.getOrCreateCode("u1");
    expect(code).toHaveLength(8);
    expect(repo.setCodeIfEmpty).toHaveBeenCalledWith("u1", code);
  });

  it("draws a new code when another account holds the one it drew", async () => {
    repo.findCodeOf.mockResolvedValue(null);
    repo.setCodeIfEmpty
      .mockRejectedValueOnce(unique())
      .mockResolvedValueOnce(true);
    await ReferralSvc.getOrCreateCode("u1");
    expect(repo.setCodeIfEmpty).toHaveBeenCalledTimes(2);
  });

  it("reads the winner's code when two requests ask at once", async () => {
    repo.findCodeOf
      .mockResolvedValueOnce(null) // first look: none
      .mockResolvedValueOnce("WINNER22"); // after losing the race
    repo.setCodeIfEmpty.mockResolvedValue(false);
    expect(await ReferralSvc.getOrCreateCode("u1")).toBe("WINNER22");
  });

  it("gives up with a 503 after five collisions", async () => {
    repo.findCodeOf.mockResolvedValue(null);
    repo.setCodeIfEmpty.mockRejectedValue(unique());
    await expect(ReferralSvc.getOrCreateCode("u1")).rejects.toMatchObject({
      status: 503,
    });
    expect(repo.setCodeIfEmpty).toHaveBeenCalledTimes(5);
  });

  it("lets a real database failure through", async () => {
    repo.findCodeOf.mockResolvedValue(null);
    repo.setCodeIfEmpty.mockRejectedValue(new Error("db down"));
    await expect(ReferralSvc.getOrCreateCode("u1")).rejects.toThrow("db down");
  });
});

describe("ReferralSvc.getMine", () => {
  function given(opts: {
    referrer?: boolean;
    paid?: boolean;
    referred?: number;
    rewarded?: number;
  }) {
    repo.findCodeOf.mockResolvedValue("ABCD2345");
    repo.countFor.mockResolvedValue({
      referred: opts.referred ?? 0,
      rewarded: opts.rewarded ?? 0,
    });
    repo.findReferralOf.mockResolvedValue(
      opts.referrer
        ? ({ id: "r1", referrerId: "u9", status: "pending" } as never)
        : null,
    );
    repo.hasPaidBooking.mockResolvedValue(opts.paid ?? false);
  }

  it("shows the code, the counts, and that a code can still be entered", async () => {
    given({ referred: 3, rewarded: 1 });
    expect(await ReferralSvc.getMine("u1")).toEqual({
      code: "ABCD2345",
      referred: 3,
      rewarded: 1,
      hasReferrer: false,
      canApplyCode: true,
    });
  });

  it("cannot enter a code once it has a referrer", async () => {
    given({ referrer: true });
    const me = await ReferralSvc.getMine("u1");
    expect(me.hasReferrer).toBe(true);
    expect(me.canApplyCode).toBe(false);
  });

  it("cannot enter a code after a paid booking", async () => {
    given({ paid: true });
    expect((await ReferralSvc.getMine("u1")).canApplyCode).toBe(false);
  });
});

describe("ReferralSvc.apply", () => {
  function ok() {
    repo.findReferralOf.mockResolvedValue(null);
    repo.hasPaidBooking.mockResolvedValue(false);
    repo.findOwnerOfCode.mockResolvedValue({ id: "u9" });
    repo.create.mockResolvedValue({} as never);
  }

  it("attaches a friend's code and says it is waiting", async () => {
    ok();
    expect(await ReferralSvc.apply("u1", " abcd-2345 ")).toEqual({
      status: "pending",
    });
    expect(repo.findOwnerOfCode).toHaveBeenCalledWith("ABCD2345");
    expect(repo.create).toHaveBeenCalledWith({
      referrerId: "u9",
      referredId: "u1",
      code: "ABCD2345",
    });
  });

  it("refuses something that is not shaped like a code, without a lookup", async () => {
    ok();
    for (const bad of ["", "short", "ABCD234O", "ABCD23456"]) {
      await expect(ReferralSvc.apply("u1", bad)).rejects.toMatchObject({
        status: 400,
      });
    }
    expect(repo.findOwnerOfCode).not.toHaveBeenCalled();
  });

  it("allows one code per account: a second is a 409", async () => {
    ok();
    repo.findReferralOf.mockResolvedValue({
      id: "r1",
      referrerId: "u9",
      status: "pending",
    } as never);
    await expect(ReferralSvc.apply("u1", "ABCD2345")).rejects.toMatchObject({
      status: 409,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses once the account has a paid booking", async () => {
    ok();
    repo.hasPaidBooking.mockResolvedValue(true);
    await expect(ReferralSvc.apply("u1", "ABCD2345")).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("answers 404 for a code nobody has", async () => {
    ok();
    repo.findOwnerOfCode.mockResolvedValue(null);
    await expect(ReferralSvc.apply("u1", "ABCD2345")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("refuses your own code", async () => {
    ok();
    repo.findOwnerOfCode.mockResolvedValue({ id: "u1" });
    await expect(ReferralSvc.apply("u1", "ABCD2345")).rejects.toMatchObject({
      status: 400,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("two requests at once leave one referrer and a 409 for the other", async () => {
    ok();
    repo.create.mockRejectedValue(unique());
    await expect(ReferralSvc.apply("u1", "ABCD2345")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("lets a real database failure through", async () => {
    ok();
    repo.create.mockRejectedValue(new Error("db down"));
    await expect(ReferralSvc.apply("u1", "ABCD2345")).rejects.toThrow(
      "db down",
    );
  });
});

describe("ReferralCtrl", () => {
  const res = () => {
    const r: Record<string, unknown> = {};
    r.status = vi.fn(() => r);
    r.json = vi.fn(() => r);
    return r as unknown as {
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };
  };
  const req = (body?: unknown) => ({ user: { userId: "u1" }, body }) as never;

  it("GET /me answers 200 with the data", async () => {
    vi.spyOn(ReferralSvc, "getMine").mockResolvedValue({
      code: "ABCD2345",
      referred: 0,
      rewarded: 0,
      hasReferrer: false,
      canApplyCode: true,
    });
    const r = res();
    await ReferralCtrl.getMine(req(), r as never);
    expect(r.status).toHaveBeenCalledWith(200);
  });

  it("POST /apply answers 201 once attached", async () => {
    vi.spyOn(ReferralSvc, "apply").mockResolvedValue({ status: "pending" });
    const r = res();
    await ReferralCtrl.apply(req({ code: "ABCD2345" }), r as never);
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it("POST /apply answers 400 with no code, without calling the service", async () => {
    const apply = vi.spyOn(ReferralSvc, "apply");
    apply.mockClear();
    for (const body of [undefined, {}, { code: "" }, { code: 42 }]) {
      const r = res();
      await ReferralCtrl.apply(req(body), r as never);
      expect(r.status).toHaveBeenCalledWith(400);
    }
    expect(apply).not.toHaveBeenCalled();
  });
});
