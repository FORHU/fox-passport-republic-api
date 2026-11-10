import { describe, it, expect } from "vitest";
import { pickStartingRate } from "../tools/backfill-eventfoxer-commission";

const at = (iso: string) => new Date(iso);

describe("backfill-eventfoxer-commission: pickStartingRate", () => {
  it("returns null for an EventFoxer with no templates", () => {
    expect(pickStartingRate([])).toBeNull();
  });

  it("uses the only template's rate", () => {
    expect(
      pickStartingRate([{ hostMarkupPct: 12.5, updatedAt: at("2026-10-01") }]),
    ).toBe(12.5);
  });

  it("uses the rate the most templates share", () => {
    expect(
      pickStartingRate([
        { hostMarkupPct: 10, updatedAt: at("2026-09-01") },
        { hostMarkupPct: 10, updatedAt: at("2026-09-02") },
        { hostMarkupPct: 20, updatedAt: at("2026-11-01") },
      ]),
    ).toBe(10);
  });

  it("breaks a tie with the most recently updated template", () => {
    expect(
      pickStartingRate([
        { hostMarkupPct: 10, updatedAt: at("2026-09-01") },
        { hostMarkupPct: 15, updatedAt: at("2026-10-15") },
        { hostMarkupPct: 10, updatedAt: at("2026-09-20") },
        { hostMarkupPct: 15, updatedAt: at("2026-08-01") },
      ]),
    ).toBe(15);
  });

  it("counts rates that round to the same 2 decimals as one rate", () => {
    expect(
      pickStartingRate([
        { hostMarkupPct: 10.001, updatedAt: at("2026-09-01") },
        { hostMarkupPct: 10, updatedAt: at("2026-09-02") },
        { hostMarkupPct: 30, updatedAt: at("2026-11-01") },
      ]),
    ).toBe(10);
  });

  it("clamps out-of-range values to 0–100", () => {
    expect(
      pickStartingRate([{ hostMarkupPct: 150, updatedAt: at("2026-09-01") }]),
    ).toBe(100);
    expect(
      pickStartingRate([{ hostMarkupPct: -5, updatedAt: at("2026-09-01") }]),
    ).toBe(0);
  });

  it("returns 0 when every template is at 0", () => {
    expect(
      pickStartingRate([
        { hostMarkupPct: 0, updatedAt: at("2026-09-01") },
        { hostMarkupPct: 0, updatedAt: at("2026-10-01") },
      ]),
    ).toBe(0);
  });
});
