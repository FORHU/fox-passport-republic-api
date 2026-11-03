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
