import { EventCategory } from "@prisma/client";

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
