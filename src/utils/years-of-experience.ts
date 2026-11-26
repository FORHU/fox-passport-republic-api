/**
 * Years of experience on a role application (api#423). Up to 30 is taken as
 * given. More than that, up to 50, is a claim: the applicant attaches a CV
 * with references (portfolioFile), the claim is kept in `claimedExperience`,
 * and an admin either confirms it or lowers `experience` to 30. The web and
 * mobile apps check the same rules before sending; this has the final word.
 */

export const BASE_MAX_YEARS_OF_EXPERIENCE = 30;
export const MAX_YEARS_OF_EXPERIENCE = 50;

const YEARS_OF_EXPERIENCE_MESSAGE = `Years of experience must be between 0 and ${MAX_YEARS_OF_EXPERIENCE}`;
// A browser can preview a PDF for the admin checking the claim; a Word file
// it can't.
export const EXPERIENCE_CV_PDF_MESSAGE =
  "The CV behind more than 30 years of experience must be a PDF";
export const EXPERIENCE_CV_MESSAGE = `Claiming more than ${BASE_MAX_YEARS_OF_EXPERIENCE} years of experience needs a CV with references`;

/**
 * Years of experience are whole years from 0 to 50, as a number or a string
 * of digits. Left out (undefined, null or "") is fine unless `required`. Over
 * 30 also needs a CV: see `applyExperienceClaim`.
 */
export function checkYearsOfExperience(
  value: unknown,
  required = false,
): { ok: true; years?: number } | { ok: false; message: string } {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return required
      ? { ok: false, message: YEARS_OF_EXPERIENCE_MESSAGE }
      : { ok: true };
  }
  const years =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  if (
    !Number.isInteger(years) ||
    years < 0 ||
    years > MAX_YEARS_OF_EXPERIENCE
  ) {
    return { ok: false, message: YEARS_OF_EXPERIENCE_MESSAGE };
  }
  return { ok: true, years };
}

/**
 * More than 30 years is kept as a bracket, not an exact number: 31–34 is
 * "30+" (30), 35–39 "35+" (35), 40–44 "40+", 45–49 "45+", and 50 is 50.
 * Returns the bracket's start; 30 or less is returned as it is.
 */
export function experienceBracket(years: number): number {
  if (years <= BASE_MAX_YEARS_OF_EXPERIENCE) return years;
  if (years >= MAX_YEARS_OF_EXPERIENCE) return MAX_YEARS_OF_EXPERIENCE;
  return Math.floor(years / 5) * 5;
}

/**
 * More than 30 years is a claim (api#423): it needs a CV, either an uploaded
 * `portfolioFileId` or a `portfolioFile` in this request (`hasCvUpload`). The
 * claim is stored as its bracket's start, in `experience` (keeping its type:
 * text for an Event Foxer) and in `claimedExperience`, so an admin who lowers
 * `experience` to 30 can restore it. Returns the message to refuse with, or
 * null.
 */
export function applyExperienceClaim(
  data: Record<string, unknown>,
  years: number | undefined,
  hasCvUpload = false,
): string | null {
  if (years === undefined || years <= BASE_MAX_YEARS_OF_EXPERIENCE) {
    return null;
  }
  const hasCv =
    hasCvUpload ||
    (typeof data.portfolioFileId === "string" &&
      data.portfolioFileId.length > 0);
  if (!hasCv) return EXPERIENCE_CV_MESSAGE;
  const bracket = experienceBracket(years);
  data.experience =
    typeof data.experience === "string" ? String(bracket) : bracket;
  data.claimedExperience = bracket;
  return null;
}
