/**
 * The links a person puts on their profile to their other social accounts.
 *
 * Only the platforms listed here are kept, and every link is turned into a
 * plain `http(s)` address on that platform's own domain, so nothing else (a
 * `javascript:` address, another site) can be stored and shown to other people.
 */
export const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "youtube",
  "website",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type SocialLinks = Partial<Record<SocialPlatform, string>>;

/** Where a bare handle such as `@rex` points on each platform. */
const HANDLE_BASE: Record<Exclude<SocialPlatform, "website">, string> = {
  instagram: "https://instagram.com/",
  facebook: "https://facebook.com/",
  tiktok: "https://tiktok.com/@",
  x: "https://x.com/",
  youtube: "https://youtube.com/@",
};

/** The domains a link on each platform may be on. */
const HOSTS: Record<Exclude<SocialPlatform, "website">, string[]> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  tiktok: ["tiktok.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
};

const HANDLE = /^@?[A-Za-z0-9._-]{1,50}$/;
const MAX_LENGTH = 300;

function onHost(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * One link, as a clean address. Returns an empty string for an empty input
 * (the person cleared it) and `null` when it is not an acceptable link.
 */
export function normalizeSocialLink(
  platform: SocialPlatform,
  raw: string,
): string | null {
  const input = raw.trim();
  if (input === "") return "";
  if (input.length > MAX_LENGTH) return null;

  if (platform !== "website" && HANDLE.test(input)) {
    return HANDLE_BASE[platform] + input.replace(/^@/, "");
  }

  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // A real address has a dot in its host; this rejects `https://localhost`.
  if (!url.hostname.includes(".")) return null;
  if (url.username || url.password) return null;
  if (platform !== "website" && !onHost(url.hostname, HOSTS[platform])) {
    return null;
  }
  return url.toString();
}

/**
 * The links to store: each known platform's address, with empty ones left
 * out. Throws a message fit to show a person when one is not acceptable.
 */
export function normalizeSocialLinks(
  input: Partial<Record<string, string | null | undefined>>,
): SocialLinks {
  const links: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const value = input[platform];
    if (value === undefined || value === null) continue;
    const link = normalizeSocialLink(platform, value);
    if (link === null) {
      throw new Error(`That ${platform} link is not valid`);
    }
    if (link !== "") links[platform] = link;
  }
  return links;
}
