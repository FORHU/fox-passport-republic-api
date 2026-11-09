import { EventCategory, RoleType } from "@prisma/client";

/**
 * The part of a city name worth matching on, for `contains` filters.
 *
 * Cities reach the search filters written several ways: the PSGC list behind
 * the city picker says "City of Makati", the map picker sends a whole place
 * name ("Makati, Metro Manila, Philippines"), and stored rows mostly say
 * "Makati" or "Makati City". Matching any of those with a plain `contains`
 * found nothing, because the needle was longer than what was stored. Keeping
 * just the first comma segment, without "City of" / "City", lets all of them
 * meet on "Makati".
 */
export function cityNeedle(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const core = input
    .split(",")[0]
    .trim()
    .replace(/^city of\s+/i, "")
    .replace(/\s+city$/i, "")
    .trim();
  return core.length > 0 ? core : undefined;
}

/**
 * The event categories a free-text search refers to, so typing "weddings" or
 * "corporate party" into the search box finds wedding or corporate events and
 * the Foxers who run them. Terms under three characters match nothing, so a
 * stray "so" doesn't pull in every social event. "other" is a catch-all, not
 * something people search for, and sits inside words like "mother".
 */
export function eventCategoriesMatching(q: unknown): EventCategory[] {
  if (typeof q !== "string") return [];
  const term = q.trim().toLowerCase();
  if (term.length < 3) return [];
  return (Object.values(EventCategory) as EventCategory[]).filter(
    (c) => c !== EventCategory.other && (term.includes(c) || c.includes(term)),
  );
}

/**
 * The role types a free-text search names, so an admin typing "investor",
 * "Investors" or "venue foxer" into the citizen directory finds the people who
 * hold that role, not just people whose name or email happens to contain the
 * word. Matches the whole role name (ignoring case, spaces, hyphens and a
 * plural "s"), or a Foxer role by its prefix ("venue" → venueFoxer). Terms
 * under three characters match nothing.
 */
export function roleTypesMatching(q: unknown): RoleType[] {
  if (typeof q !== "string") return [];
  const term = q.toLowerCase().replace(/[\s_-]+/g, "");
  if (term.length < 3) return [];
  const terms = term.endsWith("s") ? [term, term.slice(0, -1)] : [term];
  const matched = (Object.values(RoleType) as RoleType[]).filter((role) => {
    const name = role.toLowerCase();
    return terms.some((t) => name === t || name === `${t}foxer`);
  });
  // Gear, Service (Talent) and Performer Foxer were folded into Provider;
  // their old names still find Providers.
  if (
    !matched.includes(RoleType.providerFoxer) &&
    terms.some((t) => PROVIDER_ALIASES.includes(t.replace(/foxer$/, "")))
  ) {
    matched.push(RoleType.providerFoxer);
  }
  return matched;
}

const PROVIDER_ALIASES = ["gear", "service", "talent", "performer"];
