import { describe, it, expect } from "vitest";
import { isWithinDeadline } from "../src/modules/transaction-status/transaction-status.types";

describe("isWithinDeadline (pure, deterministic deadline-boundary logic)", () => {
  const deadline = new Date("2026-01-01T12:00:00.000Z");

  it("is within deadline when now equals the deadline exactly (inclusive)", () => {
    expect(isWithinDeadline(new Date("2026-01-01T12:00:00.000Z"), deadline)).toBe(true);
  });

  it("is within deadline one millisecond before", () => {
    expect(isWithinDeadline(new Date("2026-01-01T11:59:59.999Z"), deadline)).toBe(true);
  });

  it("is NOT within deadline one millisecond after", () => {
    expect(isWithinDeadline(new Date("2026-01-01T12:00:00.001Z"), deadline)).toBe(false);
  });

  it("fails closed when deadline is null", () => {
    expect(isWithinDeadline(new Date(), null)).toBe(false);
  });
});
