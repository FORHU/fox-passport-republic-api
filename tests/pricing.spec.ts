import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/utils/prisma";
import EventTemplateSvc from "../src/modules/event-template/event-template.service";

/**
 * The price every event template response carries (#264 T6): the per-line
 * breakdown from `PricingSvc`, under the field names API consumers already
 * read (`itemsTotal`, `hostMarkupAmount`, `platformFeeAmount`, `totalAmount`,
 * `estimatedTotal`, `price`). It replaced `calculateTotalsBreakdown`, which
 * charged the fee on the commission and read a 1% fee as 100%.
 *
 * Money columns are Prisma `Decimal`, whose `valueOf()` is a string, so the
 * arithmetic is pinned against Decimal inputs, not just plain numbers.
 */

vi.mock("../src/utils/prisma", () => ({
  prisma: {
    platformFeeConfig: { findMany: vi.fn() },
    venueEventFoxerAffiliation: { findMany: vi.fn() },
  },
}));

const dec = (n: string | number) => new Prisma.Decimal(n);
const feeRules = prisma.platformFeeConfig.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const affiliations = prisma.venueEventFoxerAffiliation
  .findMany as unknown as ReturnType<typeof vi.fn>;

const DEFAULT_FEE = {
  id: "default",
  name: "Event line default",
  transactionType: "event_item",
  category: null,
  subcategory: null,
  percentage: dec(5),
  fixedAmount: null,
  currency: "PHP",
  priority: 0,
  active: true,
  effectiveFrom: new Date("2026-01-01"),
  effectiveUntil: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const owner = (commissionPct: number | Prisma.Decimal | string = 10) => ({
  id: "foxer",
  commissionPct,
});

beforeEach(() => {
  vi.clearAllMocks();
  feeRules.mockResolvedValue([DEFAULT_FEE]);
  affiliations.mockResolvedValue([]);
});

describe("EventTemplateSvc.withBreakdown", () => {
  it("prices an empty template at 0 without a fee query", async () => {
    const t = await EventTemplateSvc.withBreakdown({ owner: owner() });
    expect(t).toMatchObject({ itemsTotal: 0, totalAmount: 0, price: 0 });
    expect(feeRules).not.toHaveBeenCalled();
  });

  it("sums Decimal prices as numbers, not string concatenation", async () => {
    const t = await EventTemplateSvc.withBreakdown({
      owner: owner(0),
      templateAssets: [
        {
          id: "a1",
          quantity: 2,
          asset: { price: dec("100.00"), category: "equipment" },
        },
        {
          id: "a2",
          quantity: 1,
          asset: { price: dec("50.50"), category: "equipment" },
        },
      ],
    });
    expect(t.itemsTotal).toBe(250.5);
    expect(typeof t.itemsTotal).toBe("number");
  });

  it("uses the listing price, never a template row's agreedPrice (#264 D1, C6)", async () => {
    const t = await EventTemplateSvc.withBreakdown({
      owner: owner(0),
      templateServices: [
        {
          id: "s1",
          agreedPrice: dec(1),
          service: { price: dec("8000"), category: "dj" },
        } as never,
      ],
    });
    expect(t.itemsTotal).toBe(8000);
  });

  it("charges the fees on the Foxer prices only, never on the commission", async () => {
    const t = await EventTemplateSvc.withBreakdown({
      owner: owner(10),
      templateVenues: [
        {
          id: "v1",
          venue: { id: "venue", price: dec(10000), category: "hotel" },
        },
      ],
    });
    // 10,000 + 10% commission + 5% fee on 10,000 + 3% processing on 10,000.
    expect(t).toMatchObject({
      itemsTotal: 10000,
      hostMarkupAmount: 1000,
      platformFeeAmount: 500,
      processingFeeAmount: 300,
      totalAmount: 11800,
    });
  });

  it("keeps estimatedTotal and price aligned with totalAmount, and returns every line", async () => {
    const t = await EventTemplateSvc.withBreakdown({
      owner: owner(10),
      templateServices: [
        { id: "s1", service: { price: dec(5000), category: "catering" } },
      ],
    });
    expect(t.estimatedTotal).toBe(t.totalAmount);
    expect(t.price).toBe(t.totalAmount);
    expect(t.breakdown.lines).toHaveLength(1);
    expect(t.breakdown.lines[0]).toMatchObject({
      kind: "service",
      lineTotal: 5900,
    });
  });

  it("reads the owner's rate from a cached (JSON) template, where it is a string", async () => {
    const t = await EventTemplateSvc.withBreakdown({
      owner: owner("12.5"),
      templateServices: [
        { id: "s1", service: { price: "1000.00", category: "dj" } },
      ],
    });
    expect(t.hostMarkupAmount).toBe(125);
  });

  it("refuses a template loaded without its owner's rate, instead of 0% commission", async () => {
    await expect(
      EventTemplateSvc.withBreakdown({
        templateServices: [
          { id: "s1", service: { price: dec(1000), category: "dj" } },
        ],
      }),
    ).rejects.toThrow(/commission is missing/);
  });

  it("skips excluded items", async () => {
    const t = await EventTemplateSvc.withBreakdown(
      {
        owner: owner(0),
        templateServices: [
          { id: "s1", service: { price: dec(200), category: "dj" } },
          { id: "s2", service: { price: dec(300), category: "dj" } },
        ],
      },
      { excludedServiceIds: ["s2"] },
    );
    expect(t.itemsTotal).toBe(200);
  });

  it("prices an affiliated venue at the Mayor's agreed price for this EventFoxer", async () => {
    affiliations.mockResolvedValue([
      { venueId: "venue", eventFoxerId: "foxer", agreedPrice: dec(3000) },
    ]);
    const t = await EventTemplateSvc.withBreakdown({
      ownerId: "foxer",
      owner: owner(0),
      templateVenues: [
        {
          id: "v1",
          venue: { id: "venue", price: dec(5000), category: "hotel" },
        },
      ],
    });
    expect(t.itemsTotal).toBe(3000);
    expect(affiliations.mock.calls[0][0].where).toMatchObject({
      OR: [{ venueId: "venue", eventFoxerId: "foxer" }],
      status: "approved",
      permissions: { has: "template:attach" },
    });
  });
});

describe("EventTemplateSvc.withBreakdownsForDisplay", () => {
  it("shows a template that can't be priced without a price, and still prices the rest", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const list = await EventTemplateSvc.withBreakdownsForDisplay([
      {
        id: "good",
        owner: owner(10),
        templateServices: [
          { id: "s1", service: { price: 1000, category: "dj" } },
        ],
      },
      {
        // Loaded without its listing's category: pricing refuses it.
        id: "bad",
        owner: owner(10),
        templateServices: [{ id: "s2", service: { price: 1000 } }],
      },
    ]);

    expect(list[0]).toMatchObject({ id: "good", price: 1180 });
    expect(list[1]).toMatchObject({
      id: "bad",
      price: null,
      totalAmount: null,
      breakdown: null,
    });
    expect(error).toHaveBeenCalledWith(
      "Could not price event template bad",
      expect.anything(),
    );
    error.mockRestore();
  });

  it("prices every template with one fee-rule query when they are all fine", async () => {
    await EventTemplateSvc.withBreakdownsForDisplay([
      {
        owner: owner(10),
        templateServices: [{ id: "s1", service: { price: 1, category: "dj" } }],
      },
      {
        owner: owner(10),
        templateServices: [{ id: "s2", service: { price: 1, category: "dj" } }],
      },
    ]);
    expect(feeRules).toHaveBeenCalledTimes(1);
  });
});

describe("EventTemplateSvc.withBreakdowns", () => {
  it("prices a whole list with one fee-rule query", async () => {
    const list = await EventTemplateSvc.withBreakdowns([
      {
        owner: owner(10),
        templateServices: [
          { id: "s1", service: { price: 1000, category: "dj" } },
        ],
      },
      {
        owner: owner(20),
        templateServices: [
          { id: "s2", service: { price: 1000, category: "dj" } },
        ],
      },
    ]);
    expect(list.map((t) => t.hostMarkupAmount)).toEqual([100, 200]);
    expect(feeRules).toHaveBeenCalledTimes(1);
  });
});
