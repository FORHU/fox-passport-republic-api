import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/utils/prisma";
import PricingSvc from "../src/modules/pricing/pricing.service";
import { bookingDays, MAX_BOOKING_DAYS } from "../src/utils/booking-days";

/**
 * A package booked over several days costs its price for each day: every
 * Foxer's line is per day, and the fees (all percentages) follow from it.
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

const template = {
  templateAssets: [
    { id: "a1", quantity: 2, asset: { price: dec(1000), category: "audio" } },
  ],
  templateVenues: [
    { id: "v1", venue: { id: "venue", price: dec(10000), category: "hall" } },
  ],
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  feeRules.mockResolvedValue([
    {
      id: "default",
      transactionType: "event_item",
      category: null,
      subcategory: null,
      percentage: dec(5),
      fixedAmount: null,
      priority: 0,
      active: true,
      effectiveFrom: new Date("2026-01-01"),
      effectiveUntil: null,
    },
  ]);
  affiliations.mockResolvedValue([]);
});

describe("bookingDays", () => {
  const at = (iso: string) => new Date(iso);

  it("counts one evening as one day", () => {
    // 18:00 to midnight in Manila (UTC+8).
    expect(
      bookingDays(at("2026-11-20T10:00:00Z"), at("2026-11-20T16:00:00Z")),
    ).toBe(1);
  });

  it("counts 20 to 22 November as three days", () => {
    expect(
      bookingDays(at("2026-11-20T10:00:00Z"), at("2026-11-22T16:00:00Z")),
    ).toBe(3);
  });

  it("refuses an end that isn't after the start", () => {
    const t = at("2026-11-20T10:00:00Z");
    expect(() => bookingDays(t, t)).toThrow(/after the start/);
  });

  it("allows 60 days and refuses 61 (BOOKING_TOO_LONG)", () => {
    expect(MAX_BOOKING_DAYS).toBe(60);
    // A venue from 1 Jan 00:00 to 1 Mar 23:59:59 local: 60 days.
    expect(
      bookingDays(at("2027-01-01T00:00:00Z"), at("2027-03-01T23:59:59Z")),
    ).toBe(60);
    expect(() =>
      bookingDays(at("2027-01-01T00:00:00Z"), at("2027-03-02T23:59:59Z")),
    ).toThrow(
      expect.objectContaining({ status: 400, code: "BOOKING_TOO_LONG" }),
    );
  });
});

describe("PricingSvc.calculateEventBreakdown over several days", () => {
  it("multiplies every line and the fees by the days", async () => {
    const one = await PricingSvc.calculateEventBreakdown(template, 10);
    const three = await PricingSvc.calculateEventBreakdown(
      template,
      10,
      undefined,
      { days: 3 },
    );

    expect(three.itemsTotal).toBe(one.itemsTotal * 3);
    expect(three.commissionTotal).toBe(one.commissionTotal * 3);
    expect(three.platformFee).toBe(one.platformFee * 3);
    expect(three.total).toBe(one.total * 3);
    // Each Supplier's line, which their payout is snapshotted from, is per day
    // too; the quantity stays what the template says.
    const gear = three.lines.find((l) => l.itemId === "a1")!;
    expect(gear).toMatchObject({ quantity: 2, unitPrice: 3000, price: 6000 });
  });

  it("refuses a days value that isn't a whole number of 1 or more", async () => {
    await expect(
      PricingSvc.calculateEventBreakdown(template, 10, undefined, { days: 0 }),
    ).rejects.toThrow(/days/);
  });
});
