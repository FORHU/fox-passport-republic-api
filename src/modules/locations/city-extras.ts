/**
 * Cities the bundled `country-state-city` dataset is missing, added by hand.
 *
 * Keyed by ISO country code, then by state name exactly as the dataset spells
 * it (`""` for a country with no states). Merged into the city lists by
 * `LocationsSvc.cities`, alongside the cities of approved venues, so a place
 * only needs adding here when no approved venue has brought it in yet.
 *
 * Not used for the Philippines: its list is the official PSGC one and is
 * complete.
 */
export const CITY_EXTRAS: Record<string, Record<string, string[]>> = {
  MO: { "": ["Macau", "Taipa", "Coloane", "Cotai"] },
};
