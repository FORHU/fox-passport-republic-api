import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/utils/prisma";
import PricingSvc from "../../src/modules/pricing/pricing.service";
import EventTemplateSvc from "../../src/modules/event-template/event-template.service";
import { PROCESSING_FEE_PERCENT } from "../../src/config";
import { AppError } from "../../src/utils/errors";
import {
  buildEventBreakdown,
  eventTemplateLines,
  EVENT_BREAKDOWN_INVALID_INPUT,
  type EventBreakdownInputLine,
} from "../../src/modules/pricing/event-breakdown";

const Decimal = Prisma.Decimal;

vi.mock("../../src/utils/prisma", () => ({
  prisma: { platformFeeConfig: { findMany: vi.fn() } },
}));

const findMany = prisma.platformFeeConfig.findMany as unknown as ReturnType<
  typeof vi.fn
>;

function feeRule(
  id: string,
  category: string | null,
  subcategory: string | null,
  percentage: number,
) {
  return {
    id,
    name: id,
    transactionType: "event_item",
    category,
    subcategory,
    percentage: new Decimal(percentage),
    fixedAmount: null,
    currency: "PHP",
    priority: 0,
    active: true,
    effectiveFrom: new Date("2026-01-01"),
    effectiveUntil: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

/** The plan's worked example (§2): venue 10,000 at 5%, catering 5,000 at 6%. */
const WORKED_LINES: EventBreakdownInputLine[] = [
  { kind: "venue", category: "beach_resort", unitPrice: 10000 },
  { kind: "service", category: "catering", unitPrice: 5000 },
];

describe("buildEventBreakdown (#264 T4)", () => {
  it("gives the plan's worked example exactly: 17,750", () => {
    const b = buildEventBreakdown(WORKED_LINES, {
      commissionPct: 10,
      platformFees: [{ percentage: 5 }, { percentage: 6 }],
      processingFeePct: 3,
    });

    expect(
      b.lines.map((l) => [
        l.price,
        l.commission,
        l.platformFee,
        l.processingFee,
        l.lineTotal,
      ]),
    ).toEqual([
      [10000, 1000, 500, 300, 11800],
      [5000, 500, 300, 150, 5950],
    ]);
    expect(b).toMatchObject({
      itemsTotal: 15000,
      commissionTotal: 1500,
      platformFee: 800,
      processingFee: 450,
      total: 17750,
      estimatedTotal: 17750,
      currency: "PHP",
    });
  });

  it("charges the fees on the Foxer price only, never on the commission", () => {
    const rates = (commissionPct: number) => ({
      commissionPct,
      platformFees: [{ percentage: 5 }],
      processingFeePct: 3,
    });
    const line: EventBreakdownInputLine[] = [
      { kind: "venue", unitPrice: 10000 },
    ];

    const none = buildEventBreakdown(line, rates(0));
    const high = buildEventBreakdown(line, rates(50));

    expect(high.platformFee).toBe(none.platformFee);
    expect(high.processingFee).toBe(none.processingFee);
    expect(high.platformFee).toBe(500);
    expect(high.commissionTotal).toBe(5000);
  });

  it("rounds each amount per line, and the totals are sums of the rounded lines", () => {
    const lines: EventBreakdownInputLine[] = [
      { kind: "service", unitPrice: "33.33" },
      { kind: "service", unitPrice: "33.33" },
      { kind: "service", unitPrice: "33.33" },
    ];
    const b = buildEventBreakdown(lines, {
      commissionPct: 10,
      platformFees: [{ percentage: 5 }, { percentage: 5 }, { percentage: 5 }],
      processingFeePct: 3,
    });

    // 33.33 × 10% = 3.333 → 3.33 per line; 3 lines → 9.99, not 10.00.
    expect(b.lines[0].commission).toBe(3.33);
    expect(b.commissionTotal).toBe(9.99);
    // 33.33 × 5% = 1.6665 → 1.67 (half-up); 33.33 × 3% = 0.9999 → 1.00.
    expect(b.lines[0].platformFee).toBe(1.67);
    expect(b.lines[0].processingFee).toBe(1);
    const sumOfLines = b.lines.reduce(
      (s, l) => new Decimal(s).plus(l.lineTotal).toNumber(),
      0,
    );
    expect(b.total).toBe(sumOfLines);
    // Each line: 33.33 + 3.33 + 1.67 + 1.00 = 39.33; three lines = 117.99.
    expect(b.total).toBe(117.99);
  });

  it("rounds half-up", () => {
    const b = buildEventBreakdown([{ kind: "asset", unitPrice: "1.25" }], {
      commissionPct: 10,
      platformFees: [{ percentage: 0 }],
      processingFeePct: 0,
    });
    expect(b.lines[0].commission).toBe(0.13); // 0.125 → 0.13
  });

  it("multiplies gear by its quantity before any fee", () => {
    const b = buildEventBreakdown(
      [
        {
          kind: "asset",
          category: "sound_system",
          unitPrice: 1500,
          quantity: 2,
        },
      ],
      {
        commissionPct: 10,
        platformFees: [{ percentage: 5 }],
        processingFeePct: 3,
      },
    );
    expect(b.lines[0]).toMatchObject({
      unitPrice: 1500,
      quantity: 2,
      price: 3000,
      commission: 300,
      platformFee: 150,
      processingFee: 90,
      lineTotal: 3540,
    });
  });

  it("takes a 1% fee as 1%, never 100%", () => {
    const b = buildEventBreakdown([{ kind: "venue", unitPrice: 10000 }], {
      commissionPct: 0,
      platformFees: [{ percentage: 1 }],
      processingFeePct: 0,
    });
    expect(b.platformFee).toBe(100);
  });

  it("returns zeros for an Event with no lines", () => {
    const b = buildEventBreakdown([], {
      commissionPct: 10,
      platformFees: [],
      processingFeePct: 3,
    });
    expect(b).toMatchObject({ lines: [], itemsTotal: 0, total: 0 });
  });

  it("refuses inputs that would make a wrong charge", () => {
    const ok = {
      commissionPct: 10,
      platformFees: [{ percentage: 5 }],
      processingFeePct: 3,
    };
    const venue: EventBreakdownInputLine[] = [
      { kind: "venue", unitPrice: 100 },
    ];

    expect(() =>
      buildEventBreakdown(venue, { ...ok, commissionPct: 101 }),
    ).toThrow(/commission must be a percentage from 0 to 100/);
    expect(() =>
      buildEventBreakdown(venue, { ...ok, commissionPct: NaN }),
    ).toThrow(/commission/);
    expect(() =>
      buildEventBreakdown(venue, { ...ok, platformFees: [{ percentage: -1 }] }),
    ).toThrow(/FoxPassport fee must be/);
    expect(() =>
      buildEventBreakdown(venue, { ...ok, processingFeePct: 300 }),
    ).toThrow(/processing fee must be/);
    expect(() =>
      buildEventBreakdown([{ kind: "venue", unitPrice: -5 }], ok),
    ).toThrow(/can't be negative/);
    expect(() =>
      buildEventBreakdown([{ kind: "venue", unitPrice: "abc" }], ok),
    ).toThrow(/not a number/);
    expect(() =>
      buildEventBreakdown([{ kind: "asset", unitPrice: 5, quantity: -1 }], ok),
    ).toThrow(/quantity/);
    expect(() =>
      buildEventBreakdown([{ kind: "asset", unitPrice: 5, quantity: 1.5 }], ok),
    ).toThrow(/quantity/);
    expect(() =>
      buildEventBreakdown(venue, { ...ok, platformFees: [] }),
    ).toThrow(/0 fee rates for 1 lines/);
  });
});

describe("eventTemplateLines", () => {
  const template = {
    templateAssets: [
      {
        id: "ta-1",
        quantity: 2,
        agreedPrice: 1,
        asset: {
          id: "a-1",
          price: new Decimal(1500),
          category: "sound_system",
          ownerId: "gear",
        },
      },
      { id: "ta-gone", quantity: 1, asset: null },
    ],
    templateServices: [
      {
        id: "ts-1",
        service: {
          id: "s-1",
          price: "5000",
          category: "catering",
          ownerId: "caterer",
        },
      },
      {
        id: "ts-2",
        service: { id: "s-2", price: 8000, category: "dj", ownerId: "dj" },
      },
    ],
    templateVenues: [
      {
        id: "tv-1",
        venue: {
          id: "v-1",
          price: 10000,
          category: "beach_resort",
          mayorId: "mayor",
        },
      },
    ],
  };

  it("lists gear, services, then venues, with the listing price and owner", () => {
    const lines = eventTemplateLines(template);
    expect(lines.map((l) => [l.kind, l.itemId, l.foxerId, l.category])).toEqual(
      [
        ["asset", "ta-1", "gear", "sound_system"],
        ["service", "ts-1", "caterer", "catering"],
        ["service", "ts-2", "dj", "dj"],
        ["venue", "tv-1", "mayor", "beach_resort"],
      ],
    );
    // The listing price, not the template row's agreedPrice (plan D1).
    expect(String(lines[0].unitPrice)).toBe("1500");
    expect(lines[0].quantity).toBe(2);
  });

  it("leaves out excluded rows and rows whose listing no longer exists", () => {
    const lines = eventTemplateLines(template, {
      excludedServiceIds: ["ts-2"],
      excludedVenueIds: ["tv-1"],
    });
    expect(lines.map((l) => l.itemId)).toEqual(["ta-1", "ts-1"]);
  });

  it("refuses a listing that wasn't loaded, instead of dropping its Foxer", () => {
    expect(() =>
      eventTemplateLines({ templateVenues: [{ id: "tv-1" }] }),
    ).toThrow(/loaded without their venue/);
  });

  it("refuses a listing loaded without its price, instead of pricing it at 0", () => {
    const lines = eventTemplateLines({
      templateVenues: [{ id: "tv-1", venue: { id: "v-1", category: "hotel" } }],
    });
    expect(() =>
      buildEventBreakdown(lines, {
        commissionPct: 10,
        platformFees: [{ percentage: 5 }],
        processingFeePct: 3,
      }),
    ).toThrow(/The venue price is missing/);
  });

  it("refuses a listing loaded without its category, instead of charging the wrong fee", () => {
    expect(() =>
      eventTemplateLines({
        templateServices: [{ id: "ts-1", service: { id: "s-1", price: 5000 } }],
      }),
    ).toThrow(/service listing s-1 has no category/);
  });

  it("refuses exclusions it can't apply because rows have no ids", () => {
    const noIds = {
      templateServices: [{ service: { price: 5000, category: "dj" } }],
    };
    expect(() =>
      eventTemplateLines(noIds, { excludedServiceIds: ["ts-2"] }),
    ).toThrow(/loaded without their ids/);
    // Without exclusions, rows without ids are fine (the browse query).
    expect(eventTemplateLines(noIds)).toHaveLength(1);
  });

  it("reads a gear quantity of 0 or unset as 1, as event pricing always has", () => {
    const lines = eventTemplateLines({
      templateAssets: [
        { id: "a", quantity: 0, asset: { price: 100, category: "equipment" } },
        {
          id: "b",
          quantity: null,
          asset: { price: 100, category: "equipment" },
        },
      ],
    });
    const b = buildEventBreakdown(lines, {
      commissionPct: 0,
      platformFees: [{ percentage: 0 }, { percentage: 0 }],
      processingFeePct: 0,
    });
    expect(b.lines.map((l) => l.quantity)).toEqual([1, 1]);
    expect(b.itemsTotal).toBe(200);
  });

  it("refuses with a coded error that monitoring can tell from a crash", () => {
    try {
      eventTemplateLines({ templateVenues: [{ id: "tv-1" }] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe(EVENT_BREAKDOWN_INVALID_INPUT);
      expect((e as AppError).status).toBe(500);
    }
  });
});

describe("EventTemplateSvc.calculateItemsTotal shares the exclusion rule", () => {
  it("still excludes by row id", () => {
    const total = EventTemplateSvc.calculateItemsTotal(
      {
        templateServices: [
          { id: "ts-1", service: { price: 5000 } },
          { id: "ts-2", service: { price: 8000 } },
        ],
      },
      { excludedServiceIds: ["ts-2"] },
    );
    expect(total).toBe(5000);
  });

  it("refuses exclusions it can't apply, instead of charging for removed items", () => {
    expect(() =>
      EventTemplateSvc.calculateItemsTotal(
        { templateServices: [{ service: { price: 5000 } }] },
        { excludedServiceIds: ["ts-2"] },
      ),
    ).toThrow(/loaded without their ids/);
  });
});

describe("PricingSvc.calculateEventBreakdown", () => {
  beforeEach(() => vi.clearAllMocks());

  const template = {
    templateServices: [
      { id: "ts-1", service: { id: "s-1", price: 5000, category: "catering" } },
    ],
    templateVenues: [
      {
        id: "tv-1",
        venue: { id: "v-1", price: 10000, category: "beach_resort" },
      },
    ],
  };

  it("prices the worked example from the admin's fee rules in one query", async () => {
    findMany.mockResolvedValue([
      feeRule("default", null, null, 5),
      feeRule("catering", "service", "catering", 6),
    ]);

    const b = await PricingSvc.calculateEventBreakdown(
      template,
      10,
      undefined,
      {
        processingFeePct: 3,
      },
    );

    expect(b.total).toBe(17750);
    expect(
      b.lines.map((l) => [l.kind, l.platformFeePct, l.platformFeeRuleId]),
    ).toEqual([
      ["service", 6, "catering"],
      ["venue", 5, "default"],
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("uses PROCESSING_FEE_PERCENT when no rate is passed", async () => {
    findMany.mockResolvedValue([feeRule("default", null, null, 5)]);
    const b = await PricingSvc.calculateEventBreakdown(template, 10);
    // Whatever the environment sets, not a hard-coded 3 (review finding 6).
    expect(b.lines[0].processingFeePct).toBe(PROCESSING_FEE_PERCENT);
    expect(b.processingFee).toBe(
      new Decimal(15000)
        .times(PROCESSING_FEE_PERCENT)
        .dividedBy(100)
        .toNumber(),
    );
  });

  it("carries the fee rule's id and name onto each line, for the booking snapshot", async () => {
    findMany.mockResolvedValue([feeRule("default", null, null, 5)]);
    const b = await PricingSvc.calculateEventBreakdown(template, 10);
    expect(b.lines[0]).toMatchObject({
      platformFeeRuleId: "default",
      platformFeeRuleName: "default",
    });
  });

  it("applies exclusions before pricing", async () => {
    findMany.mockResolvedValue([feeRule("default", null, null, 5)]);
    const b = await PricingSvc.calculateEventBreakdown(
      template,
      10,
      { excludedVenueIds: ["tv-1"] },
      { processingFeePct: 3 },
    );
    expect(b.itemsTotal).toBe(5000);
    expect(b.total).toBe(5900); // 5,000 + 500 + 250 + 150
  });

  it("refuses to price when no fee rule covers a line", async () => {
    findMany.mockResolvedValue([]);
    await expect(
      PricingSvc.calculateEventBreakdown(template, 10),
    ).rejects.toThrow(/No FoxPassport fee rule covers/);
  });
});
