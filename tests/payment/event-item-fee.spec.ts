import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/utils/prisma";
import PricingSvc, {
  pickPricingRule,
} from "../../src/modules/pricing/pricing.service";
import PlatformFeeConfigSvc from "../../src/modules/platform-fee-config/platform-fee-config.service";
import { eventItemRuleProblem } from "../../src/modules/pricing/event-item-fee";

const Decimal = Prisma.Decimal;

vi.mock("../../src/utils/prisma", () => ({
  prisma: {
    platformFeeConfig: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

function rule(
  id: string,
  over: {
    transactionType?: string | null;
    category?: string | null;
    subcategory?: string | null;
    percentage?: number | null;
    fixedAmount?: number | null;
    priority?: number;
  },
) {
  return {
    id,
    name: id,
    transactionType: over.transactionType ?? null,
    category: over.category ?? null,
    subcategory: over.subcategory ?? null,
    percentage:
      over.percentage === null ? null : new Decimal(over.percentage ?? 5),
    fixedAmount:
      over.fixedAmount == null ? null : new Decimal(over.fixedAmount),
    currency: "PHP",
    priority: over.priority ?? 0,
    active: true,
    effectiveFrom: new Date("2026-01-01"),
    effectiveUntil: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

const DEFAULT = rule("default", {
  transactionType: "event_item",
  percentage: 5,
});
const SERVICES = rule("services", {
  transactionType: "event_item",
  category: "service",
  percentage: 6,
});
const CATERING = rule("catering", {
  transactionType: "event_item",
  category: "service",
  subcategory: "catering",
  percentage: 1,
});

const findMany = prisma.platformFeeConfig.findMany as unknown as ReturnType<
  typeof vi.fn
>;

describe("PricingSvc.resolveEventItemFeeRates (#264 T3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("picks the most specific rule per line from one query", async () => {
    findMany.mockResolvedValue([DEFAULT, SERVICES, CATERING]);

    const rates = await PricingSvc.resolveEventItemFeeRates([
      { itemType: "venue", listingCategory: "beach_resort" },
      { itemType: "service", listingCategory: "dj" },
      { itemType: "service", listingCategory: "catering" },
    ]);

    expect(rates.map((r) => r.ruleId)).toEqual([
      "default",
      "services",
      "catering",
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("returns percentages as stored: 1 means 1%, never 100%", async () => {
    findMany.mockResolvedValue([DEFAULT, CATERING]);
    const [rate] = await PricingSvc.resolveEventItemFeeRates([
      { itemType: "service", listingCategory: "catering" },
    ]);
    expect(rate.percentage).toBe(1);
  });

  it("falls back to the default when a line has no listing category", async () => {
    findMany.mockResolvedValue([DEFAULT, CATERING]);
    const [rate] = await PricingSvc.resolveEventItemFeeRates([
      { itemType: "service" },
    ]);
    expect(rate.ruleId).toBe("default");
  });

  it("only fetches event_item rules in force that have a percentage", async () => {
    findMany.mockResolvedValue([DEFAULT]);
    await PricingSvc.resolveEventItemFeeRates([{ itemType: "venue" }]);
    const { where } = findMany.mock.calls[0][0];
    expect(JSON.stringify(where)).toContain('"active":true');
    expect(JSON.stringify(where)).toContain('"effectiveUntil"');
    // No catch-all (transactionType null) rules: a high-priority catch-all,
    // a fixed-amount-only one, or one with a bare `subcategory` can't take
    // over Event lines (review findings 1-3).
    expect(where.AND[1]).toEqual({
      transactionType: "event_item",
      percentage: { not: null },
    });
  });

  it("refuses to price at 0% when no rule covers a line", async () => {
    findMany.mockResolvedValue([CATERING]);
    await expect(
      PricingSvc.resolveEventItemFeeRates([
        { itemType: "venue", listingCategory: "hotel" },
      ]),
    ).rejects.toThrow(/No FoxPassport fee rule covers venue \(hotel\)/);
  });

  it("does not query for an Event with no lines", async () => {
    await expect(PricingSvc.resolveEventItemFeeRates([])).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("admin preview for event_item matches checkout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the Event line resolver, so it shows the rule checkout charges", async () => {
    findMany.mockResolvedValue([DEFAULT, SERVICES, CATERING]);
    const rule = await PlatformFeeConfigSvc.preview({
      transactionType: "event_item",
      category: "service",
      subcategory: "catering",
    });
    expect(rule?.id).toBe("catering");
    expect(rule?.percentage).toBe(1);
    expect(findMany.mock.calls[0][0].where.AND[1]).toEqual({
      transactionType: "event_item",
      percentage: { not: null },
    });
  });

  it("returns null when checkout would refuse the line", async () => {
    findMany.mockResolvedValue([]);
    await expect(
      PlatformFeeConfigSvc.preview({
        transactionType: "event_item",
        category: "venue",
      }),
    ).resolves.toBeNull();
  });

  it("keeps the old resolver for other transaction types", async () => {
    findMany.mockResolvedValue([
      rule("global", { fixedAmount: 50, percentage: null }),
    ]);
    const rule1 = await PlatformFeeConfigSvc.preview({
      transactionType: "event",
    });
    expect(rule1?.id).toBe("global");
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty("AND");
  });
});

describe("pickPricingRule keeps resolvePricingRule's behaviour", () => {
  it("prefers subcategory over category over transaction type, then priority", () => {
    const rules = [
      rule("type", { transactionType: "event", priority: 50 }),
      rule("cat", { transactionType: "event", category: "wedding" }),
    ];
    expect(
      pickPricingRule(rules, { transactionType: "event", category: "wedding" })
        ?.id,
    ).toBe("cat");
    expect(
      pickPricingRule(rules, { transactionType: "event", category: "social" })
        ?.id,
    ).toBe("type");
    expect(
      pickPricingRule(rules, { transactionType: "sponsorship" }),
    ).toBeNull();
  });
});

describe("event_item fee rules are validated", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a default, an item type, and a type + listing category", () => {
    const base = { transactionType: "event_item", percentage: 5 };
    expect(eventItemRuleProblem(base)).toBeNull();
    expect(eventItemRuleProblem({ ...base, category: "venue" })).toBeNull();
    expect(
      eventItemRuleProblem({
        ...base,
        category: "service",
        subcategory: "catering",
      }),
    ).toBeNull();
  });

  it("rejects an unknown item type or a listing category of another type", () => {
    const base = { transactionType: "event_item", percentage: 5 };
    expect(eventItemRuleProblem({ ...base, category: "wedding" })).toMatch(
      /item type/,
    );
    expect(
      eventItemRuleProblem({
        ...base,
        category: "venue",
        subcategory: "catering",
      }),
    ).toMatch(/not a venue category/);
  });

  it("needs the item type with a listing category, since `other` is in every type", () => {
    expect(
      eventItemRuleProblem({
        transactionType: "event_item",
        subcategory: "other",
        percentage: 5,
      }),
    ).toMatch(/Choose the item type/);
  });

  it("needs a percentage and no fixed amount", () => {
    expect(
      eventItemRuleProblem({ transactionType: "event_item", fixedAmount: 25 }),
    ).toMatch(/Enter a percentage/);
    expect(
      eventItemRuleProblem({
        transactionType: "event_item",
        percentage: 5,
        fixedAmount: 25,
      }),
    ).toMatch(/Remove the fixed amount/);
  });

  it("leaves event and sponsorship rules as they were", () => {
    expect(
      eventItemRuleProblem({ transactionType: "event", fixedAmount: 25 }),
    ).toBeNull();
  });

  it("create refuses an item type on a non-event_item rule", async () => {
    await expect(
      PlatformFeeConfigSvc.create({
        name: "Wrong",
        transactionType: "event",
        category: "venue",
        percentage: 5,
      }),
    ).rejects.toThrow(/Set the transaction type to "event_item"/);
    expect(prisma.platformFeeConfig.create).not.toHaveBeenCalled();
  });

  it("update checks the merged rule, not just the patch", async () => {
    (prisma.platformFeeConfig.findUnique as any).mockResolvedValue(
      rule("svc", {
        transactionType: "event_item",
        category: "service",
        percentage: 6,
      }),
    );
    await expect(
      PlatformFeeConfigSvc.update("svc", { subcategory: "beach_resort" }),
    ).rejects.toThrow(/not a service category/);
    expect(prisma.platformFeeConfig.update).not.toHaveBeenCalled();
  });
});
