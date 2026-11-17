import { describe, it, expect } from "vitest";
import {
  compactTin,
  maskPattern,
  tinFormatsFor,
  tinFormatsResponse,
  validateTin,
} from "../src/utils/tax-id-formats";
import { checkTin } from "../src/modules/role-request/role-request.controller";

/**
 * The Venue Foxer form showed a 12-digit TIN the API refused (app#299,
 * WEB-MAYOR-APPLICATION-007). The form and the API now read one table of
 * formats per country; these pin the table and the check both sides run.
 */
describe("validateTin", () => {
  it.each([
    ["PH", "123456789"],
    ["PH", "123-456-789"],
    ["PH", "123456789000"],
    ["PH", "123-456-789-000"],
    ["US", "123-45-6789"],
    ["US", "912-34-5678"],
    ["IN", "ABCDE1234F"],
    ["IN", "abcde1234f"],
    ["IN", "1234 5678 9012"],
    ["GB", "AA345678A"],
    ["GB", "1234567890"],
    // The PDF's own examples, laid out as it writes them.
    ["BR", "12.345.6789-01"],
    ["BR", "12345678901"],
    ["CA", "12345678-9"],
    ["CH", "123.4567.8901.23"],
    ["CN", "12345678901234567A"],
    ["CN", "12345678901234567X"],
    ["ES", "82345678A"],
    ["ES", "L2345678A"],
    ["ES", "X2345678L"],
    ["FI", "123456-789-T"],
    ["FI", "123456A789T"],
    ["HK", "AA1234567"],
    ["MY", "IG1234567890"],
    ["SE", "1234567890"],
    ["TW", "A134567890"],
  ])("accepts %s %s", (cc, tin) => {
    expect(validateTin(cc, tin)).toBeNull();
  });

  it.each([
    ["PH", "1234567890"],
    ["PH", "12345678"],
    ["PH", "123-456-78A"],
    ["GB", "AA345678E"],
    ["MY", "XX123456789"],
    ["CN", "12345678901234567Y"],
    ["FI", "123456*789T"],
    ["ES", "Q2345678A"],
    ["TW", "A334567890"],
    // Not in the PDF, so no longer accepted: the US EIN, Taiwan's 8-digit
    // business number, Vietnam's 13-digit tax ID with branch code.
    ["US", "12-3456789"],
    ["TW", "12345678"],
    ["VN", "0123456789-001"],
  ])("refuses %s %s", (cc, tin) => {
    expect(validateTin(cc, tin)).not.toBeNull();
  });

  it("names the formats in the message", () => {
    expect(validateTin("PH", "1234567890")).toBe(
      "TIN must look like 123-456-789 or 123-456-789-000",
    );
  });

  it("accepts every format's own example", () => {
    for (const cc of [
      "BD",
      "BR",
      "CA",
      "CH",
      "CN",
      "DE",
      "DK",
      "ES",
      "FI",
      "FJ",
      "FR",
      "GB",
      "GR",
      "HK",
      "ID",
      "IE",
      "IN",
      "IT",
      "JP",
      "KR",
      "LK",
      "MT",
      "MY",
      "NL",
      "NP",
      "NZ",
      "PH",
      "PK",
      "SE",
      "SG",
      "TH",
      "TW",
      "US",
      "VN",
      "VU",
      "ZA",
    ]) {
      const { formats } = tinFormatsFor(cc);
      expect(formats.length, cc).toBeGreaterThan(0);
      for (const f of formats) {
        expect(validateTin(cc, f.example), `${cc} ${f.example}`).toBeNull();
      }
    }
  });

  it("treats empty as valid — the caller decides whether it is required", () => {
    expect(validateTin("PH", "")).toBeNull();
    expect(validateTin("PH", "   ")).toBeNull();
  });

  it("falls back to 4-20 letters or digits for a country not in the table", () => {
    expect(tinFormatsFor("AR").formats).toEqual([]);
    expect(validateTin("AR", "20-12345678-3")).toBeNull();
    expect(validateTin("AR", "123")).not.toBeNull();
    expect(validateTin("AR", "1".repeat(21))).not.toBeNull();
    expect(validateTin("AR", "12--34")).not.toBeNull();
  });

  it("marks the UAE as issuing no TIN", () => {
    expect(tinFormatsFor("AE").issuesTin).toBe(false);
    expect(tinFormatsFor("ae").issuesTin).toBe(false);
    expect(tinFormatsFor("PH").issuesTin).toBe(true);
  });
});

describe("compactTin", () => {
  it("drops separators and uppercases", () => {
    expect(compactTin("PH", "123-456-789-000")).toBe("123456789000");
    expect(compactTin("IN", "abcde1234f")).toBe("ABCDE1234F");
    expect(compactTin("TH", "1 2345 67890 12 3")).toBe("1234567890123");
  });

  it("keeps the Finnish century sign, which is part of the number", () => {
    expect(compactTin("FI", "131052-308T")).toBe("131052-308T");
  });
});

describe("maskPattern", () => {
  it("captures token runs and makes separators optional", () => {
    expect(maskPattern("000-000")).toBe("^(\\d\\d\\d)\\-?(\\d\\d\\d)$");
    expect(maskPattern("0000 0000")).toBe("^(\\d\\d\\d\\d)(\\d\\d\\d\\d)$");
  });

  it("serves patterns the app can rebuild as RegExp", () => {
    const [id] = tinFormatsResponse("CN").formats;
    const m = new RegExp(id.pattern).exec("12345678901234567X");
    expect(m).not.toBeNull();
    expect(new RegExp(id.rule as string).test(m!.slice(1).join(""))).toBe(true);
    expect(tinFormatsResponse("PH").formats[0].rule).toBeNull();
  });
});

/** The check the app runs on the served JSON (shared/lib/tin.ts there). */
function appCheck(cc: string, value: string): string | null {
  const { formats, message } = tinFormatsResponse(cc);
  const v = value.toUpperCase().replace(/\s+/g, "");
  if (v === "") return null;
  const ok = formats.some((f) => {
    const m = new RegExp(f.pattern).exec(v);
    return !!m && (!f.rule || new RegExp(f.rule).test(m.slice(1).join("")));
  });
  return ok ? null : message;
}

describe("tinFormatsResponse", () => {
  it("gives the app the same verdict and message as the API", () => {
    const cases: [string, string][] = [
      ["PH", "123-456-789-000"],
      ["PH", "1234567890"],
      ["GB", "QQ123456E"],
      ["FI", "131052-308T"],
      ["CN", "C1234567890123456A"],
      ["CN", "X1234567890123456A"],
      ["AR", "20-12345678-3"],
      ["AR", "12"],
      ["AE", "100123456700003"],
    ];
    for (const cc of ["PH", "US", "IN", "MY", "VN", "BD"]) {
      for (const f of tinFormatsFor(cc).formats) cases.push([cc, f.example]);
    }
    for (const [cc, tin] of cases) {
      expect(appCheck(cc, tin), `${cc} ${tin}`).toBe(validateTin(cc, tin));
    }
  });

  it("serves the fallback as the one format of an unlisted country", () => {
    const res = tinFormatsResponse("AR");
    expect(res.formats).toHaveLength(1);
    expect(res.formats[0].mask).toBe("");
    expect(res.message).toBe("Tax ID must be 4-20 letters or digits");
  });
});

describe("checkTin (role application)", () => {
  it("checks an application without a tax country as Philippine", () => {
    const data: Record<string, unknown> = { tinNumber: "123-456-789-000" };
    expect(checkTin(data)).toBeNull();
    expect(data).toEqual({ tinNumber: "123456789000", tinCountry: "PH" });
  });

  it("keeps the mobile app's 9-digit TIN valid", () => {
    const data: Record<string, unknown> = { tinNumber: "123456789" };
    expect(checkTin(data)).toBeNull();
  });

  it("checks against the named country and stores it uppercased", () => {
    const data: Record<string, unknown> = {
      tinNumber: "ab123456c",
      tinCountry: "gb",
    };
    expect(checkTin(data)).toBeNull();
    expect(data).toEqual({ tinNumber: "AB123456C", tinCountry: "GB" });
  });

  it("refuses a TIN that does not fit the country, with the format", () => {
    expect(checkTin({ tinNumber: "1234567890", tinCountry: "PH" })).toBe(
      "TIN must look like 123-456-789 or 123-456-789-000",
    );
  });

  it("treats an empty tax country as none (Philippine)", () => {
    const data: Record<string, unknown> = {
      tinNumber: "123456789",
      tinCountry: "",
    };
    expect(checkTin(data)).toBeNull();
    expect(data.tinCountry).toBe("PH");
    const empty: Record<string, unknown> = { tinNumber: "", tinCountry: "" };
    expect(checkTin(empty)).toBeNull();
    expect(empty).not.toHaveProperty("tinCountry");
  });

  it("refuses a malformed tax country", () => {
    expect(checkTin({ tinNumber: "123456789", tinCountry: "PHL" })).toBe(
      "Tax country must be a 2-letter country code",
    );
    expect(checkTin({ tinNumber: "123456789", tinCountry: 63 })).not.toBeNull();
  });

  it("refuses a TIN that is not text", () => {
    expect(checkTin({ tinNumber: 123456789 })).toBe("TIN Number must be text");
  });

  it("allows an empty TIN (optional for a Provider)", () => {
    expect(checkTin({ tinNumber: "" })).toBeNull();
    expect(checkTin({})).toBeNull();
  });
});
