import { Country } from "country-state-city";
import {
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";

/** A country's calling code ("63"), or "" where it has no phone numbering. */
export function phoneCallingCode(isoCode: string): string {
  return isSupportedCountry(isoCode) ? getCountryCallingCode(isoCode) : "";
}

/**
 * The project's countries — the location dataset GeoDirectory serves — that
 * have phone numbering.
 */
const PHONE_COUNTRIES = new Set(
  Country.getAllCountries()
    .map((c) => c.isoCode)
    .filter((cc) => phoneCallingCode(cc)),
);

/**
 * A phone number as E.164 (`+639171234567`) if it is valid in one of the
 * project's countries, else null. `defaultCountry` reads a number typed
 * without its `+code` — the Philippines for clients that send no country.
 */
export function normalizePhone(
  raw: string,
  defaultCountry = "PH",
): string | null {
  // The parser pulls a number out of free text ("<b>0917…</b>" parses), so
  // anything that isn't a phone character is refused before it gets there.
  if (!/^[\d\s()+.-]{1,30}$/.test(raw)) return null;
  const parsed = parsePhoneNumberFromString(raw, defaultCountry as CountryCode);
  return parsed?.isValid() &&
    parsed.country &&
    PHONE_COUNTRIES.has(parsed.country)
    ? parsed.number
    : null;
}

/**
 * Countries where a contact number must be a mobile number (landlines are
 * refused). Kept in step with the web's MOBILE_ONLY (shared/lib/phone.ts).
 */
export const MOBILE_ONLY = new Set(["PH"]);

/**
 * A contact number (a Venue Foxer's) as E.164: normalizePhone, and a mobile
 * number where its country is in MOBILE_ONLY — `+639171234567` passes,
 * the Manila landline `+63 2 8123 4567` doesn't. Else null.
 */
export function normalizeContactPhone(
  raw: string,
  defaultCountry = "PH",
): string | null {
  const e164 = normalizePhone(raw, defaultCountry);
  if (!e164) return null;
  const parsed = parsePhoneNumberFromString(e164);
  return parsed?.country &&
    MOBILE_ONLY.has(parsed.country) &&
    parsed.getType() !== "MOBILE"
    ? null
    : e164;
}

/** The country a number is in: its own `+code`, else `defaultCountry`. */
export function phoneCountry(raw: string, defaultCountry: string): string {
  const trimmed = raw.trim();
  return (
    (trimmed.startsWith("+")
      ? parsePhoneNumberFromString(trimmed)?.country
      : undefined) ?? defaultCountry
  );
}
