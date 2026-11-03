import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_MAX,
  LONG_DESCRIPTION_MAX,
  NAME_MAX,
  PRICE_MAX,
  QUANTITY_MAX,
  descriptionJoi,
  nameJoi,
  priceJoi,
  quantityJoi,
} from "../src/utils/limits";

describe("name limits", () => {
  it("accepts 1 and 100 characters and trims", () => {
    expect(nameJoi().validate("a").error).toBeUndefined();
    expect(nameJoi().validate("a".repeat(NAME_MAX)).error).toBeUndefined();
    expect(nameJoi().validate("  Fox  ").value).toBe("Fox");
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["101 characters", "a".repeat(NAME_MAX + 1)],
  ])("rejects %s", (_label, value) => {
    expect(nameJoi().validate(value).error).toBeDefined();
  });

  it("explains the length limit", () => {
    const { error } = nameJoi().validate("a".repeat(NAME_MAX + 1));
    expect(error?.message).toBe("Names can be up to 100 characters.");
  });
});

describe("description limits", () => {
  it("allows up to 500, or 2000 for long descriptions", () => {
    expect(
      descriptionJoi().validate("a".repeat(DESCRIPTION_MAX)).error,
    ).toBeUndefined();
    expect(
      descriptionJoi().validate("a".repeat(DESCRIPTION_MAX + 1)).error,
    ).toBeDefined();
    const long = descriptionJoi(LONG_DESCRIPTION_MAX);
    expect(
      long.validate("a".repeat(LONG_DESCRIPTION_MAX)).error,
    ).toBeUndefined();
    expect(
      long.validate("a".repeat(LONG_DESCRIPTION_MAX + 1)).error,
    ).toBeDefined();
  });
});

describe("quantity limits", () => {
  it("accepts 1 and the maximum", () => {
    expect(quantityJoi().validate(1).error).toBeUndefined();
    expect(quantityJoi().validate(QUANTITY_MAX).error).toBeUndefined();
  });

  it.each([
    ["zero", 0],
    ["negative", -5],
    ["above the maximum", QUANTITY_MAX + 1],
    ["a 32-bit overflow", 2_147_483_648],
    ["a fraction", 1.5],
    ["text", "many"],
  ])("rejects %s", (_label, value) => {
    expect(quantityJoi().validate(value).error).toBeDefined();
  });
});

describe("price limits", () => {
  it.each([0, 19.99, 1200, PRICE_MAX])("accepts %s", (value) => {
    expect(priceJoi().validate(value).error).toBeUndefined();
  });

  it.each([
    ["negative", -1],
    ["above the maximum", PRICE_MAX + 0.01],
    ["three decimals", 1.005],
    ["text", "free"],
  ])("rejects %s", (_label, value) => {
    expect(priceJoi().validate(value).error).toBeDefined();
  });

  it("says why a negative price is rejected", () => {
    expect(priceJoi().validate(-1).error?.message).toBe(
      "Prices cannot be negative.",
    );
  });

  it("reads numeric strings from form bodies", () => {
    expect(priceJoi().validate("12.50").value).toBe(12.5);
  });
});
