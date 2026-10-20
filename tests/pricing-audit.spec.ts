import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Pricing changes leave a history: who changed a fee rule or promotion,
 * when, and what it was before and after (PRICING-ADMINISTRATION-PRODUCT.md
 * Priority 4). The repositories are stubbed; what is asserted is the audit
 * row each write produces.
 */

const recordChange = vi.fn(async () => {});
vi.mock("../src/modules/audit/audit.service", () => ({
  recordChange,
  listAuditForTarget: vi.fn(async () => []),
}));

const dec = (n: number) => new Prisma.Decimal(n);

const RULE = {
  id: "rule-1",
  name: "Gear fee",
  transactionType: "asset",
  category: null,
  subcategory: null,
  percentage: dec(10),
  fixedAmount: null,
  currency: "PHP",
  priority: 0,
  active: true,
  effectiveFrom: new Date("2026-01-01"),
  effectiveUntil: null,
};

vi.mock(
  "../src/modules/platform-fee-config/platform-fee-config.repository",
  () => ({
    default: {
      findById: vi.fn(async () => RULE),
      create: vi.fn(async (data: Record<string, unknown>) => ({
        ...RULE,
        ...data,
        percentage: dec(Number(data.percentage)),
      })),
      update: vi.fn(async (_id: string, data: Record<string, unknown>) => ({
        ...RULE,
        percentage: dec(Number(data.percentage)),
      })),
      softDelete: vi.fn(async () => ({ ...RULE, active: false })),
    },
  }),
);

const PROMO = {
  id: "promo-1",
  name: "Welcome",
  discountType: "percentage",
  discountValue: dec(10),
  minSubtotal: null,
  maxDiscount: null,
  startDate: null,
  endDate: null,
};

vi.mock("../src/modules/promotion/promotion.repository", () => ({
  default: {
    findById: vi.fn(async () => PROMO),
    update: vi.fn(async (_id: string, data: Record<string, unknown>) => ({
      ...PROMO,
      discountValue: dec(Number(data.discountValue)),
    })),
    setVoucherActive: vi.fn(async (id: string, active: boolean) => ({
      id,
      code: "WELCOME10",
      promotionId: "promo-1",
      active,
    })),
  },
}));

const { default: FeeSvc } = await import(
  "../src/modules/platform-fee-config/platform-fee-config.service"
);
const { default: PromotionSvc } = await import(
  "../src/modules/promotion/promotion.service"
);

const admin = { userId: "admin-1", email: "admin@example.com" };

beforeEach(() => recordChange.mockClear());

describe("fee rule changes are audited", () => {
  it("an update records the actor and both values", async () => {
    await FeeSvc.update("rule-1", { percentage: 12 }, admin);

    expect(recordChange).toHaveBeenCalledWith(
      admin,
      "feeRule.update",
      "rule-1",
      expect.objectContaining({
        previous: expect.objectContaining({ percentage: 10 }),
        current: expect.objectContaining({ percentage: 12 }),
      }),
    );
  });

  it("a deactivation records what was switched off", async () => {
    await FeeSvc.remove("rule-1", admin);

    expect(recordChange).toHaveBeenCalledWith(
      admin,
      "feeRule.deactivate",
      "rule-1",
      { previous: expect.objectContaining({ percentage: 10, active: true }) },
    );
  });

  it("a create records the new rule", async () => {
    await FeeSvc.create({ name: "New", percentage: 5 }, admin);

    expect(recordChange).toHaveBeenCalledWith(
      admin,
      "feeRule.create",
      "rule-1",
      { current: expect.objectContaining({ percentage: 5 }) },
    );
  });
});

describe("promotion and voucher changes are audited", () => {
  it("a promotion update records both values", async () => {
    await PromotionSvc.update("promo-1", { discountValue: 15 }, admin);

    expect(recordChange).toHaveBeenCalledWith(
      admin,
      "promotion.update",
      "promo-1",
      expect.objectContaining({
        previous: expect.objectContaining({ discountValue: 10 }),
        current: expect.objectContaining({ discountValue: 15 }),
      }),
    );
  });

  it("a voucher toggle is filed under its promotion", async () => {
    await PromotionSvc.setVoucherActive("v-1", false, admin);

    expect(recordChange).toHaveBeenCalledWith(
      admin,
      "voucher.setActive",
      "promo-1",
      { voucherId: "v-1", code: "WELCOME10", active: false },
    );
  });
});
