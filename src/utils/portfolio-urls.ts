/**
 * Links to an applicant's work hosted elsewhere (a site, Behance, Instagram):
 * an Event Foxer's or Provider's `portfolioUrls` (app#371). The web and mobile
 * apps check the same rules before sending; this has the final word.
 */

export const MAX_PORTFOLIO_URLS = 5;
export const MAX_PORTFOLIO_URL_LENGTH = 2048;

export type PortfolioUrlsResult =
  { ok: true; urls: string[] } | { ok: false; message: string };

/** Why this one link can't be kept, or null if it can. */
function linkError(link: string): string | null {
  if (link.length > MAX_PORTFOLIO_URL_LENGTH) {
    return `This link is too long: ${link.slice(0, 40)}…`;
  }
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return `Enter a full web address starting with https://, not "${link}"`;
  }
  // http(s) only: a javascript: or data: link must never reach the admin
  // panel, where reviewers click these.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return `Use a web address starting with https://, not "${link}"`;
  }
  // "https://portfolio" parses, but goes nowhere for anyone else.
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) {
    return `"${link}" isn't a complete web address`;
  }
  if (url.username || url.password) {
    return `Remove the sign-in details from "${link}"`;
  }
  return null;
}

/**
 * The list to store — trimmed, blanks dropped, duplicates removed — or the
 * message to show. Left out or null means none.
 */
export function checkPortfolioUrls(raw: unknown): PortfolioUrlsResult {
  if (raw === undefined || raw === null) return { ok: true, urls: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, message: "Portfolio links must be a list" };
  }
  const urls: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return { ok: false, message: "Each portfolio link must be text" };
    }
    const link = item.trim();
    if (link === "" || urls.includes(link)) continue;
    const error = linkError(link);
    if (error) return { ok: false, message: error };
    urls.push(link);
  }
  if (urls.length > MAX_PORTFOLIO_URLS) {
    return {
      ok: false,
      message: `Add at most ${MAX_PORTFOLIO_URLS} portfolio links`,
    };
  }
  return { ok: true, urls };
}
