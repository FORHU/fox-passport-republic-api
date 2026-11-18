import { describe, it, expect, vi } from "vitest";
import {
  blockedDayHitsRange,
  dayKey,
} from "../src/modules/availability/blocked-days";
import AvailabilitySvc from "../src/modules/availability/availability.service";
import { AvailabilityConflictError } from "../src/modules/availability/availability.types";

const at = (iso: string) => new Date(iso);

describe("blockedDayHitsRange", () => {
  it("holds up a booking that starts later on a day blocked at midnight", () => {
    // The bug this replaces: 00:00 is before an 18:00 start, so comparing the
    // timestamps let this booking through.
    expect(
      blockedDayHitsRange(
        [at("2026-12-05T00:00:00.000Z")],
        at("2026-12-05T18:00:00.000Z"),
        at("2026-12-05T23:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("does not touch the day before or after", () => {
    const start = at("2026-12-05T10:00:00.000Z");
    const end = at("2026-12-05T15:00:00.000Z");
    expect(
      blockedDayHitsRange([at("2026-12-04T00:00:00.000Z")], start, end),
    ).toBe(false);
    expect(
      blockedDayHitsRange([at("2026-12-06T00:00:00.000Z")], start, end),
    ).toBe(false);
  });

  it("does not spill into the next day when a booking ends exactly at midnight", () => {
    const start = at("2026-12-05T20:00:00.000Z");
    const end = at("2026-12-06T00:00:00.000Z");
    expect(
      blockedDayHitsRange([at("2026-12-06T00:00:00.000Z")], start, end),
    ).toBe(false);
    expect(
      blockedDayHitsRange([at("2026-12-05T00:00:00.000Z")], start, end),
    ).toBe(true);
  });

  it("catches a day in the middle of a multi-day booking and its last day", () => {
    const start = at("2026-12-05T18:00:00.000Z");
    const end = at("2026-12-07T02:00:00.000Z");
    expect(
      blockedDayHitsRange([at("2026-12-06T00:00:00.000Z")], start, end),
    ).toBe(true);
    expect(
      blockedDayHitsRange([at("2026-12-07T00:00:00.000Z")], start, end),
    ).toBe(true);
    expect(
      blockedDayHitsRange([at("2026-12-08T00:00:00.000Z")], start, end),
    ).toBe(false);
  });

  it("counts the start day of an empty or backwards range", () => {
    const d = at("2026-12-05T10:00:00.000Z");
    expect(blockedDayHitsRange([at("2026-12-05T00:00:00.000Z")], d, d)).toBe(
      true,
    );
    expect(
      blockedDayHitsRange(
        [at("2026-12-05T00:00:00.000Z")],
        d,
        at("2026-12-04T10:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("is false when nothing is blocked", () => {
    expect(
      blockedDayHitsRange(
        [],
        at("2026-12-05T10:00:00.000Z"),
        at("2026-12-05T15:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("keys a day by its UTC date", () => {
    expect(dayKey(at("2026-12-05T23:59:59.000Z"))).toBe("2026-12-05");
  });
});

describe("AvailabilitySvc.reserve for a venue with a blocked day", () => {
  /** A transaction that knows one venue with these blocked days and no bookings. */
  const txWith = (blockedDates: Date[]) => ({
    $executeRaw: vi.fn(async () => 1),
    venue: { findUniqueOrThrow: vi.fn(async () => ({ blockedDates })) },
    eventVenueTransaction: { findFirst: vi.fn(async () => null) },
  });
  const reserve = (tx: ReturnType<typeof txWith>, start: string, end: string) =>
    AvailabilitySvc.reserve(tx as never, [
      {
        kind: "venue",
        itemId: "v1",
        dateRange: { start: at(start), end: at(end) },
      },
    ]);

  it("refuses a booking that starts later on a blocked day", async () => {
    const tx = txWith([at("2026-12-05T00:00:00.000Z")]);

    await expect(
      reserve(tx, "2026-12-05T18:00:00.000Z", "2026-12-05T23:00:00.000Z"),
    ).rejects.toBeInstanceOf(AvailabilityConflictError);
  });

  it("allows a booking on a day that is not blocked", async () => {
    const tx = txWith([at("2026-12-05T00:00:00.000Z")]);

    await expect(
      reserve(tx, "2026-12-06T18:00:00.000Z", "2026-12-06T23:00:00.000Z"),
    ).resolves.toBeUndefined();
  });

  it("allows a booking that ends exactly as the blocked day begins", async () => {
    const tx = txWith([at("2026-12-06T00:00:00.000Z")]);

    await expect(
      reserve(tx, "2026-12-05T20:00:00.000Z", "2026-12-06T00:00:00.000Z"),
    ).resolves.toBeUndefined();
  });
});
