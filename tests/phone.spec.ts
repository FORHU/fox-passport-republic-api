import { describe, it, expect } from "vitest";
import { GeoDirectory } from "../src/modules/locations/locations.service";
import {
  normalizeContactPhone,
  normalizePhone,
  phoneCountry,
} from "../src/utils/phone";

/**
 * The countries endpoint serves libphonenumber's calling code (the dataset's
 * own reads "+1-809 and 1-829" for some), and a phone number is accepted only
 * for a country on that list.
 */

const code = (cc: string) =>
  GeoDirectory.countries().find((c) => c.code === cc)?.phoneCode;

describe("GeoDirectory.countries phoneCode", () => {
  it("is a clean calling code", () => {
    expect(code("PH")).toBe("63");
    expect(code("DO")).toBe("1");
    expect(code("GG")).toBe("44");
  });

  it("is empty for a territory with no phone numbering", () => {
    expect(code("AQ")).toBe("");
  });
});

describe("normalizePhone", () => {
  it("reads a number with no +code in the default country", () => {
    expect(normalizePhone("415 555 0132", "US")).toBe("+14155550132");
    expect(normalizePhone("0917 123 4567")).toBe("+639171234567");
  });

  it("refuses a valid number from a country outside the project's list", () => {
    expect(normalizePhone("+247 40123")).toBeNull();
  });

  it("refuses a number wrapped in other text", () => {
    expect(normalizePhone("call 09171234567")).toBeNull();
  });
});

describe("normalizeContactPhone", () => {
  it("accepts a Philippine mobile number", () => {
    expect(normalizeContactPhone("0917 123 4567")).toBe("+639171234567");
    expect(normalizeContactPhone("+63 905 123 4567")).toBe("+639051234567");
  });

  it("refuses a Philippine landline", () => {
    expect(normalizePhone("+63 2 8123 4567")).toBe("+63281234567");
    expect(normalizeContactPhone("+63 2 8123 4567")).toBeNull();
  });

  it("keeps landlines outside the Philippines", () => {
    expect(normalizeContactPhone("+44 20 7946 0958")).toBe("+442079460958");
  });
});

describe("phoneCountry", () => {
  it("is the number's own +code, else the default", () => {
    expect(phoneCountry("+1 415 555 0132", "PH")).toBe("US");
    expect(phoneCountry("0917 123 4567", "PH")).toBe("PH");
  });
});
