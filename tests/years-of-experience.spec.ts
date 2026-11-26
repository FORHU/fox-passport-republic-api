import { describe, it, expect } from "vitest";
import {
  applyExperienceClaim,
  experienceBracket,
} from "../src/utils/years-of-experience";

/**
 * api#423: more than 30 years is kept as a bracket (30+, 35+, 40+, 45+, 50),
 * stored as the bracket's start.
 */
describe("experienceBracket", () => {
  it.each([
    [31, 30],
    [34, 30],
    [35, 35],
    [39, 35],
    [40, 40],
    [44, 40],
    [45, 45],
    [49, 45],
    [50, 50],
  ])("puts %i years in the bracket starting at %i", (years, start) => {
    expect(experienceBracket(years)).toBe(start);
  });

  it.each([0, 12, 30])("leaves %i years as it is", (years) => {
    expect(experienceBracket(years)).toBe(years);
  });
});

describe("applyExperienceClaim", () => {
  it("stores a claim as its bracket, keeping text as text", () => {
    const data: Record<string, unknown> = {
      experience: "47",
      portfolioFileId: "file-cv",
    };
    expect(applyExperienceClaim(data, 47)).toBeNull();
    expect(data.experience).toBe("45");
    expect(data.claimedExperience).toBe(45);
  });

  it("leaves 30 years or less untouched", () => {
    const data: Record<string, unknown> = { experience: 30 };
    expect(applyExperienceClaim(data, 30)).toBeNull();
    expect(data.experience).toBe(30);
    expect(data.claimedExperience).toBeUndefined();
  });
});
