import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * BUG-17 (api#160): the API, not the client, decides which codes are shown,
 * how many there are, and whether more can be added. Generate and import
 * refuse a promotion that can't take codes, with the reason a client shows.
 * The repository is stubbed; what is asserted is the service's decisions.
 */

vi.mock("../src/modules/audit/audit.service", () => ({
  recordChange: vi.fn(async () => {}),
  listAuditForTarget: vi.fn(async () => []),
}));

const dec = (n: number) => new Prisma.Decimal(n);

function promo(overrides: Record<string, unknown> = {}) {
  return {
    id: "promo-1",
    name: "Summer",
    providerId: "foxer-1",
    discountType: "percentage",
    discountValue: dec(10),
    minSubtotal: null,
    maxDiscount: null,
    startDate: null,
    endDate: null,
    active: true,
    autoApply: false,
    vouchers: [],
    ...overrides,
  };
}

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findAll: vi.fn(),
  findAllForProvider: vi.fn(),
  findByIdWithVisibleCodes: vi.fn(),
  createVouchers: vi.fn(async (_id: string, codes: string[]) =>
    codes.map((code) => ({ id: `v-${code}`, code })),
  ),
  codeExists: vi.fn(async () => false),
}));
vi.mock("../src/modules/promotion/promotion.repository", () => ({
  default: repo,
}));

const { default: PromotionSvc, codeGenerationBlock } =
  await import("../src/modules/promotion/promotion.service");

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  repo.findById.mockResolvedValue(promo());
});

describe("codeGenerationBlock", () => {
  const now = new Date("2026-11-04T00:00:00Z");

  it("allows an active promotion with no end date or a future one", () => {
    expect(codeGenerationBlock(promo(), now)).toBeNull();
    expect(
      codeGenerationBlock(
        promo({ endDate: new Date(now.getTime() + DAY) }),
        now,
      ),
    ).toBeNull();
  });

  it("explains why an auto-apply, deactivated or expired promotion can't take codes", () => {
    expect(codeGenerationBlock(promo({ autoApply: true }), now)).toBe(
      "This promotion applies automatically, so it has no codes.",
    );
    expect(codeGenerationBlock(promo({ active: false }), now)).toBe(
      "This promotion is deactivated. Reactivate it to add codes.",
    );
    expect(
      codeGenerationBlock(
        promo({ endDate: new Date("2026-10-31T00:00:00Z") }),
        now,
      ),
    ).toBe("This promotion ended on 2026-10-31. Extend it to add codes.");
  });
});

describe("generateVouchers", () => {
  it("creates the requested number of codes for an eligible promotion", async () => {
    const vouchers = await PromotionSvc.generateVouchers(
      "promo-1",
      3,
      "summer",
    );
    expect(vouchers).toHaveLength(3);
    const [, codes] = repo.createVouchers.mock.calls[0];
    expect(codes).toHaveLength(3);
    for (const code of codes) expect(code).toMatch(/^SUMMER-[A-Z0-9]{6}$/);
  });

  it.each([
    ["auto-apply", { autoApply: true }],
    ["deactivated", { active: false }],
    ["expired", { endDate: new Date(Date.now() - DAY) }],
  ])("refuses a %s promotion with its reason", async (_label, overrides) => {
    repo.findById.mockResolvedValue(promo(overrides));
    await expect(
      PromotionSvc.generateVouchers("promo-1", 5),
    ).rejects.toMatchObject({
      status: 400,
      message: codeGenerationBlock(promo(overrides)),
    });
    expect(repo.createVouchers).not.toHaveBeenCalled();
  });

  it("keeps the 1-500 bounds", async () => {
    await expect(
      PromotionSvc.generateVouchers("promo-1", 0),
    ).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      PromotionSvc.generateVouchers("promo-1", 501),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it("won't let a chosen prefix pass for the hidden auto-apply anchor", async () => {
    await expect(
      PromotionSvc.generateVouchers("promo-1", 2, "auto"),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.createVouchers).not.toHaveBeenCalled();
  });

  it("checks ownership first for a Foxer's own promotion", async () => {
    repo.findById.mockResolvedValue(promo({ providerId: "someone-else" }));
    await expect(
      PromotionSvc.generateVouchersOwn("foxer-1", "promo-1", 2),
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.createVouchers).not.toHaveBeenCalled();
  });
});

describe("importVouchers", () => {
  it("refuses a promotion that can't take codes", async () => {
    repo.findById.mockResolvedValue(promo({ active: false }));
    await expect(
      PromotionSvc.importVouchers("promo-1", ["FLYER10"]),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.createVouchers).not.toHaveBeenCalled();
  });

  it("skips a code that would pass for the hidden anchor", async () => {
    const result = await PromotionSvc.importVouchers("promo-1", [
      "flyer10",
      "auto-sale",
    ]);
    expect(repo.createVouchers).toHaveBeenCalledWith("promo-1", ["FLYER10"]);
    expect(result.skipped).toEqual(["AUTO-SALE"]);
  });
});

describe("promotion responses", () => {
  it("carry the visible code count and whether codes can be added", async () => {
    repo.findAll.mockResolvedValue([
      promo({ _count: { vouchers: 4 } }),
      promo({ id: "promo-2", autoApply: true, _count: { vouchers: 0 } }),
    ]);
    const [open, auto] = await PromotionSvc.getAll(true);

    expect(open).toMatchObject({
      voucherCount: 4,
      canGenerateCodes: true,
      codeGenerationBlockedReason: null,
      discountValue: 10,
    });
    expect(auto).toMatchObject({
      voucherCount: 0,
      canGenerateCodes: false,
      codeGenerationBlockedReason:
        "This promotion applies automatically, so it has no codes.",
    });
    expect(open).not.toHaveProperty("_count");
  });

  it("are the same for a Foxer's own list and a single promotion", async () => {
    repo.findAllForProvider.mockResolvedValue([
      promo({ _count: { vouchers: 2 } }),
    ]);
    repo.findByIdWithVisibleCodes.mockResolvedValue(
      promo({ active: false, _count: { vouchers: 2 } }),
    );

    const [own] = await PromotionSvc.getAllForProvider("foxer-1");
    expect(own).toMatchObject({ voucherCount: 2, canGenerateCodes: true });

    const one = await PromotionSvc.getById("promo-1");
    expect(one).toMatchObject({ voucherCount: 2, canGenerateCodes: false });
  });
});
