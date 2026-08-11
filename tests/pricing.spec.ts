import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import EventTemplateSvc from "../src/services/event-template.service";

/**
 * Guards the server-computed price breakdown described in
 * docs/adr/0001-host-markup-and-server-computed-event-total.md.
 *
 * The important case is Prisma `Decimal`: money columns are Decimal, and
 * decimal.js implements `valueOf()` as a *string*, so `0 + amount` concatenates
 * instead of adding. These tests pin the arithmetic against Decimal inputs, not
 * just plain numbers.
 */
const dec = (n: string | number) => new Prisma.Decimal(n);

describe("calculateItemsTotal", () => {
  it("returns 0 for an empty template", () => {
    expect(EventTemplateSvc.calculateItemsTotal({})).toBe(0);
  });

  it("sums Decimal asset prices as numbers, not string concatenation", () => {
    const total = EventTemplateSvc.calculateItemsTotal({
      templateAssets: [
        { id: "a1", agreedPrice: dec("100.00"), quantity: 2 },
        { id: "a2", agreedPrice: dec("50.50"), quantity: 1 },
      ],
    });
    expect(total).toBe(250.5);
    expect(typeof total).toBe("number");
  });

  it("multiplies asset price by quantity, defaulting quantity to 1", () => {
    expect(
      EventTemplateSvc.calculateItemsTotal({
        templateAssets: [{ id: "a1", agreedPrice: dec("75") }],
      }),
    ).toBe(75);
  });

  it("sums services and venues alongside assets", () => {
    const total = EventTemplateSvc.calculateItemsTotal({
      templateAssets: [{ id: "a1", agreedPrice: dec("100"), quantity: 1 }],
      templateServices: [{ id: "s1", agreedPrice: dec("200") }],
      templateVenues: [{ id: "v1", agreedPrice: dec("300") }],
    });
    expect(total).toBe(600);
  });

  it("falls back to the listed price when agreedPrice is absent", () => {
    const total = EventTemplateSvc.calculateItemsTotal({
      templateAssets: [{ id: "a1", asset: { price: dec("42") }, quantity: 1 }],
      templateServices: [{ id: "s1", service: { price: dec("8") } }],
      templateVenues: [{ id: "v1", venue: { price: dec("10") } }],
    });
    expect(total).toBe(60);
  });

  // `agreedPrice` is Decimal @default(0) and non-nullable, so an unnegotiated
  // item arrives as Decimal(0) — a truthy object. The old `||` fallback never
  // fired and these items were counted as 0.
  it("falls back to the listed price when agreedPrice is Decimal(0)", () => {
    const total = EventTemplateSvc.calculateItemsTotal({
      templateAssets: [
        {
          id: "a1",
          agreedPrice: dec(0),
          asset: { price: dec("42") },
          quantity: 1,
        },
      ],
      templateServices: [
        { id: "s1", agreedPrice: dec(0), service: { price: dec("8") } },
      ],
      templateVenues: [
        { id: "v1", agreedPrice: dec(0), venue: { price: dec("10") } },
      ],
    });
    expect(total).toBe(60);
  });

  it("prefers a negotiated price over the listed price", () => {
    const total = EventTemplateSvc.calculateItemsTotal({
      templateAssets: [
        {
          id: "a1",
          agreedPrice: dec("30"),
          asset: { price: dec("999") },
          quantity: 1,
        },
      ],
    });
    expect(total).toBe(30);
  });

  it("applies quantity to a listed-price fallback", () => {
    const total = EventTemplateSvc.calculateItemsTotal({
      templateAssets: [
        {
          id: "a1",
          agreedPrice: dec(0),
          asset: { price: dec("25") },
          quantity: 4,
        },
      ],
    });
    expect(total).toBe(100);
  });

  it("counts an item with neither price as zero", () => {
    expect(
      EventTemplateSvc.calculateItemsTotal({
        templateAssets: [{ id: "a1", agreedPrice: dec(0), quantity: 3 }],
      }),
    ).toBe(0);
  });

  it("skips excluded items", () => {
    const total = EventTemplateSvc.calculateItemsTotal(
      {
        templateAssets: [
          { id: "a1", agreedPrice: dec("100"), quantity: 1 },
          { id: "a2", agreedPrice: dec("100"), quantity: 1 },
        ],
        templateVenues: [{ id: "v1", agreedPrice: dec("500") }],
      },
      { excludedAssetIds: ["a2"], excludedVenueIds: ["v1"] },
    );
    expect(total).toBe(100);
  });
});

describe("calculateTotalsBreakdown", () => {
  it("adds Host markup, then the platform fee on top of both", () => {
    // items 1000, 10% host markup = 100, 5% platform fee on 1100 = 55
    const result = EventTemplateSvc.calculateTotalsBreakdown(
      {
        hostMarkupPct: 10,
        templateAssets: [{ id: "a1", agreedPrice: dec("1000"), quantity: 1 }],
      },
      undefined,
      5,
    );

    expect(result.itemsTotal).toBe(1000);
    expect(result.hostMarkupAmount).toBe(100);
    expect(result.platformFeeAmount).toBe(55);
    expect(result.totalAmount).toBe(1155);
  });

  it("never carves the platform fee out of the item total", () => {
    const result = EventTemplateSvc.calculateTotalsBreakdown(
      {
        hostMarkupPct: 0,
        templateVenues: [{ id: "v1", agreedPrice: dec("200") }],
      },
      undefined,
      5,
    );
    // Providers still see the full 200; the fee is additive.
    expect(result.itemsTotal).toBe(200);
    expect(result.totalAmount).toBe(210);
  });

  it("treats a missing hostMarkupPct as zero markup", () => {
    const result = EventTemplateSvc.calculateTotalsBreakdown(
      { templateAssets: [{ id: "a1", agreedPrice: dec("100"), quantity: 1 }] },
      undefined,
      0,
    );
    expect(result.hostMarkupAmount).toBe(0);
    expect(result.totalAmount).toBe(100);
  });

  it("keeps estimatedTotal aligned with totalAmount", () => {
    const result = EventTemplateSvc.calculateTotalsBreakdown(
      {
        templateAssets: [{ id: "a1", agreedPrice: dec("123.45"), quantity: 1 }],
      },
      undefined,
      0,
    );
    expect(result.estimatedTotal).toBe(result.totalAmount);
  });
});
