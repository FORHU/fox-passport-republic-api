import { describe, it, expect } from "vitest";
import { readPercentEnv } from "../src/utils/percent-env";

/**
 * A percentage that prices money is checked at startup, so a typo or an
 * out-of-range value stops the API instead of mispricing every charge.
 */
describe("readPercentEnv", () => {
  it("uses the default when unset or empty", () => {
    expect(readPercentEnv("PROCESSING_FEE_PERCENT", undefined, 3)).toBe(3);
    expect(readPercentEnv("PROCESSING_FEE_PERCENT", "", 3)).toBe(3);
    expect(readPercentEnv("PROCESSING_FEE_PERCENT", "   ", 3)).toBe(3);
  });

  it("reads a percentage, including 0, 100 and decimals", () => {
    expect(readPercentEnv("PROCESSING_FEE_PERCENT", "3", 3)).toBe(3);
    expect(readPercentEnv("PROCESSING_FEE_PERCENT", " 3.5 ", 3)).toBe(3.5);
    expect(readPercentEnv("PROCESSING_FEE_PERCENT", "0", 3)).toBe(0);
    expect(readPercentEnv("PROCESSING_FEE_PERCENT", "100", 3)).toBe(100);
  });

  it("refuses a value that is not a number, naming the variable", () => {
    expect(() => readPercentEnv("PROCESSING_FEE_PERCENT", "3%", 3)).toThrow(
      /PROCESSING_FEE_PERCENT is "3%", which is not a number/,
    );
    expect(() => readPercentEnv("PROCESSING_FEE_PERCENT", "three", 3)).toThrow(
      /not a number/,
    );
  });

  it("refuses a value outside 0–100", () => {
    expect(() => readPercentEnv("PROCESSING_FEE_PERCENT", "-1", 3)).toThrow(
      /must be a percentage from 0 to 100/,
    );
    expect(() => readPercentEnv("PROCESSING_FEE_PERCENT", "300", 3)).toThrow(
      /must be a percentage from 0 to 100/,
    );
  });
});
