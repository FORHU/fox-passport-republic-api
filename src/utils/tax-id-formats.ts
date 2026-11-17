/**
 * Taxpayer Identification Number (TIN) formats by country, for the Venue
 * Foxer and Provider Foxer applications. Served to the app by
 * GET /locations/countries/:countryCode/tin-formats, so the form's mask and
 * check and this API's check read the same table.
 *
 * Source: the CRS "TIN or functional equivalent" reference for the top CRS
 * jurisdictions (top-20-crs-countries.pdf), followed as written: its formats
 * and examples, `(x/y)` read as "one of" and `(x)` as optional. Passports and
 * the PH UMID are left out — they are not tax numbers. One addition: the
 * Philippine TIN is also accepted without its 3-digit branch code (9 digits),
 * which the mobile app sends. Formats only: no check-digit validation.
 *
 * `mask` uses the app's input-mask syntax (react-imask): `0` a digit, `a` a
 * letter, `*` a letter, digit, `+` or `-` (so every format using `*` sets a
 * `rule` to narrow it); any other character is a separator
 * the mask types for you, and which the check treats as optional. `rule`, when
 * set, is a stricter regex on the compact value (separators removed).
 */

export interface TinFormat {
  /** What the number is called, e.g. "TIN", "PAN". */
  label: string;
  mask: string;
  /** Shown as the field's placeholder and in the error message. */
  example: string;
  rule?: RegExp;
}

export interface CountryTinFormats {
  formats: TinFormat[];
  /** false for a country that issues no TIN: the field becomes optional. */
  issuesTin: boolean;
}

const f = (
  label: string,
  mask: string,
  example: string,
  rule?: RegExp,
): TinFormat => ({ label, mask, example, rule });

// Formats are listed shortest first: the app's mask starts on the first one
// and moves to a longer one only when the typed number outgrows it.
const TABLE: Record<string, TinFormat[]> = {
  BD: [
    f("TIN (old) or NID", "000-000-0000", "123-456-7890"),
    f("eTIN", "000-000-000-000", "000-123-456-001"),
    f("NID", "0000000000000", "1234567890123"),
    f("NID", "00000000000000000", "12345678901234567"),
  ],
  BR: [f("CPF", "00.000.0000-00", "12.345.6789-01")],
  CA: [f("SIN", "00000000-0", "12345678-9")],
  CH: [f("AHV number", "000.0000.0000.00", "123.4567.8901.23")],
  CN: [
    f(
      "National ID number",
      "00000000000000000*",
      "123456789012345678",
      // The PDF's (8/A); X is the check character real IDs end with.
      /^\d{17}[\dAX]$/,
    ),
    f(
      "Local tax registration number",
      "a0000000000000000*",
      "C1234567890123456A",
      /^[CWHMT]\d{16}[\dA]$/,
    ),
  ],
  DE: [
    f("IdNr", "0000000000", "1234567890"),
    f("IdNr", "00000000000", "12345678901"),
    f("IdNr", "0000000000000", "1234567890123"),
  ],
  DK: [f("CPR", "000000-0000", "123456-7890")],
  ES: [
    f("NIF (DNI)", "*0000000*", "82345678A", /^[\dLK]\d{7}[\dA-Z]$/),
    f("NIF (NIE)", "a0000000a", "X2345678L", /^[XYZ]\d{7}[A-Z]$/),
  ],
  FI: [
    f(
      "Personal identity code",
      "000000*000-*",
      "123456-789-T",
      /^\d{6}[-+A]\d{3}[0-9A-Z]$/,
    ),
  ],
  FJ: [f("TIN", "00-00000-0-0", "12-34567-8-9")],
  FR: [f("SPI / NIF", "0000000000000", "0234567890123", /^[0-3]\d{12}$/)],
  GB: [
    f("NINO", "aa000000a", "AA345678A", /^[A-Z]{2}\d{6}[A-D]$/),
    f("UTR", "0000000000", "1234567890"),
  ],
  GR: [f("AFM", "000000000", "123456789")],
  HK: [
    f("HKID", "a000000*", "A1234567", /^[A-Z]\d{6}[\dA-Z]$/),
    f("HKID", "aa000000*", "AA1234567", /^[A-Z]{2}\d{6}[\dA-Z]$/),
  ],
  ID: [
    f("NPWP", "000000000000000", "123456789012345"),
    f("NPWP or NIK", "0000000000000000", "1234567890123456"),
  ],
  IE: [f("PPSN", "0000000a", "1234567A"), f("PPSN", "0000000aa", "1234567AA")],
  IN: [
    f("PAN", "aaaaa0000a", "ABCDE1234F"),
    f("Aadhaar", "0000 0000 0000", "1234 5678 9012"),
  ],
  IT: [f("Codice fiscale", "aaaaaa00a00a000a", "ABCDEF78G01H234J")],
  JP: [f("My Number", "000000000000", "123456789012")],
  KR: [f("Resident registration number", "000000-0000000", "123456-7890123")],
  LK: [
    f("TIN", "00000000", "12345678"),
    f("TIN", "00000000a", "12345678A"),
    f("NID", "000000000a", "123456789V", /^\d{9}[VX]$/),
    f("NID", "000000000000", "123456789012"),
  ],
  MT: [
    f("National ID number", "0000000a", "1234567M", /^\d{7}[MGAPLHBZ]$/),
    f("National ID number", "000000000", "123456789"),
  ],
  MY: [
    f("TIN", "aa000000000", "SG123456789", /^(SG|OG|IG)\d{9}$/),
    f("TIN", "aa0000000000", "SG1234567890", /^(SG|OG|IG)\d{10}$/),
    f("NRIC", "000000-00-0000", "123456-78-9012"),
    f("TIN", "aa00000000000", "SG12345678901", /^(SG|OG|IG)\d{11}$/),
  ],
  NL: [f("BSN", "000000000", "123456789")],
  NP: [
    f("PAN", "000000000", "123456789"),
    f("NID", "00000000000", "12345678901"),
  ],
  NZ: [
    f("IRD number", "00000000", "12345678"),
    f("IRD number", "000000000", "123456789"),
  ],
  PH: [
    f("TIN", "000-000-000", "123-456-789"),
    f("TIN", "000-000-000-000", "123-456-789-000"),
  ],
  PK: [f("CNIC", "00000-0000000-0", "12345-6789012-3")],
  SE: [f("Personnummer or co-ordination number", "0000000000", "1234567890")],
  SG: [f("NRIC or FIN", "a0000000a", "S2345678A", /^[STFGM]\d{7}[A-Z]$/)],
  TH: [f("National ID number", "0 0000 00000 00 0", "1 2345 67890 12 3")],
  TW: [f("National ID number", "a000000000", "A134567890", /^[A-Z][12]\d{8}$/)],
  US: [f("SSN or ITIN", "000-00-0000", "123-45-6789")],
  VN: [
    f("Citizen ID", "000000000", "003456789"),
    f("Tax ID", "0000000000", "1234567890"),
    f("Citizen ID", "000000000000", "003456789012"),
  ],
  VU: [f("TIN", "000000", "123456")],
  ZA: [
    f("TIN", "0000000000", "0234567890", /^[01239]\d{9}$/),
    f("National ID number", "0000000000000", "1234567890123"),
  ],
};

/** Countries the CRS reference lists as issuing no TIN. */
const NO_TIN = new Set(["AE"]);

/** Any reasonable ID, for a country not in the table: 4–20 characters. */
export const FALLBACK_TIN_FORMAT: TinFormat = {
  label: "Tax ID",
  mask: "",
  example: "Tax ID number",
};
const FALLBACK = /^[A-Z0-9](?:[A-Z0-9]|[-./](?=[A-Z0-9])){3,19}$/;

/** The default when an application names no tax country (older clients). */
export const DEFAULT_TIN_COUNTRY = "PH";

export function tinFormatsFor(countryCode: string): CountryTinFormats {
  const cc = countryCode.trim().toUpperCase();
  return { formats: TABLE[cc] ?? [], issuesTin: !NO_TIN.has(cc) };
}

const TOKEN: Record<string, string> = {
  "0": "\\d",
  a: "[A-Z]",
  "*": "[A-Z0-9+\\-]",
};

/**
 * The regex a mask stands for, on an uppercased value without spaces. Each run
 * of mask tokens is a capture group, and each separator is optional, so
 * "123456789000" and "123-456-789-000" both match the PH mask.
 */
export function maskPattern(mask: string): string {
  let out = "^";
  let group = "";
  for (const ch of mask) {
    if (TOKEN[ch]) {
      group += TOKEN[ch];
      continue;
    }
    if (group) out += `(${group})`;
    group = "";
    if (ch !== " ") out += `${ch.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&")}?`;
  }
  if (group) out += `(${group})`;
  return `${out}$`;
}

const normalize = (value: string) => value.toUpperCase().replace(/\s+/g, "");

/** The value with separators removed, when it matches `format`; else null. */
function matchFormat(format: TinFormat, value: string): string | null {
  const m = new RegExp(maskPattern(format.mask)).exec(normalize(value));
  if (!m) return null;
  const compact = m.slice(1).join("");
  return !format.rule || format.rule.test(compact) ? compact : null;
}

/** What a TIN that fits none of `formats` is told. */
function formatMessage(formats: TinFormat[]): string {
  if (formats.length === 0) return "Tax ID must be 4-20 letters or digits";
  const list = formats.map((x) => x.example);
  const examples =
    list.length > 1
      ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`
      : list[0];
  const labels = [...new Set(formats.map((x) => x.label))].join(" / ");
  return `${labels} must look like ${examples}`;
}

/**
 * Checks a TIN against its country's formats. Returns the message to show,
 * or null when it is valid. An empty value is valid here — whether the field
 * is required is the caller's call.
 */
export function validateTin(countryCode: string, value: string): string | null {
  if (normalize(value) === "") return null;
  const { formats } = tinFormatsFor(countryCode);
  const ok =
    formats.length === 0
      ? FALLBACK.test(normalize(value))
      : formats.some((x) => matchFormat(x, value) !== null);
  return ok ? null : formatMessage(formats);
}

/**
 * The TIN as stored: uppercased, separators removed. Call only after
 * validateTin returned null.
 */
export function compactTin(countryCode: string, value: string): string {
  const { formats } = tinFormatsFor(countryCode);
  for (const x of formats) {
    const compact = matchFormat(x, value);
    if (compact !== null) return compact;
  }
  return normalize(value).replace(/[-./]/g, "");
}

/**
 * A country's formats as JSON for the app, regexes as source strings. A value
 * is valid when, uppercased and without spaces, it matches some format's
 * `pattern` and its captured groups joined match that format's `rule` (if
 * any). A country not in the table gets the fallback as its one format, with
 * no mask. `message` is what validateTin says when nothing fits.
 */
export function tinFormatsResponse(countryCode: string) {
  const { formats, issuesTin } = tinFormatsFor(countryCode);
  return {
    issuesTin,
    message: formatMessage(formats),
    formats:
      formats.length === 0
        ? [{ ...FALLBACK_TIN_FORMAT, pattern: FALLBACK.source, rule: null }]
        : formats.map((x) => ({
            label: x.label,
            mask: x.mask,
            example: x.example,
            pattern: maskPattern(x.mask),
            rule: x.rule?.source ?? null,
          })),
  };
}
