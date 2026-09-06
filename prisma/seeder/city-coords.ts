import { polygonsOverlap, type LngLat } from "../../src/utils/geo";

/**
 * Shared lat/lng lookup for seed data with landmark-level micro-coordinates
 * and regional city centroids. Allows realistic geospatial testing without
 * artificial pin-stacking across cities, while deliberately grouping
 * multi-event building complexes.
 */
export const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Manila: { lat: 14.5995, lng: 120.9842 },
  Taguig: { lat: 14.5176, lng: 121.0509 },
  "Cebu City": { lat: 10.3157, lng: 123.8854 },
  Pasig: { lat: 14.5764, lng: 121.0851 },
  "Quezon City": { lat: 14.676, lng: 121.0437 },
  Pasay: { lat: 14.5378, lng: 121.0014 },
  Makati: { lat: 14.5547, lng: 121.0244 },
  Tagaytay: { lat: 14.1152, lng: 120.9624 },
  "Baguio City": { lat: 16.4023, lng: 120.596 },
  Mandaluyong: { lat: 14.5794, lng: 121.0359 },
  "Angeles City": { lat: 15.145, lng: 120.5887 },
  Tanauan: { lat: 14.0856, lng: 121.1511 },
  Antipolo: { lat: 14.5872, lng: 121.1761 },
  Angono: { lat: 14.5236, lng: 121.1528 },
  Lian: { lat: 13.9592, lng: 120.6565 },
  "San Fernando": { lat: 15.029, lng: 120.6899 },
  Malolos: { lat: 14.8428, lng: 120.8128 },
  Silang: { lat: 14.2302, lng: 120.9758 },
  Dasmariñas: { lat: 14.3294, lng: 120.9367 },
  "San Miguel": { lat: 15.1588, lng: 120.9774 },
  Marikina: { lat: 14.6507, lng: 121.1029 },
  Boracay: { lat: 11.9674, lng: 121.9248 },
  "General Luna": { lat: 9.7977, lng: 126.0939 },
  "Davao City": { lat: 7.1907, lng: 125.4553 },
  "El Nido": { lat: 11.1859, lng: 119.4083 },
  "Puerto Princesa": { lat: 9.7391, lng: 118.7353 },
  Aparri: { lat: 18.3535, lng: 121.636 },
  Panglao: { lat: 9.5843, lng: 123.7568 },
  Nasugbu: { lat: 13.9303, lng: 120.63 },
  "San Juan": { lat: 16.6583, lng: 120.3308 },
  Iba: { lat: 15.3296, lng: 119.9752 },
  Pagudpud: { lat: 18.5598, lng: 120.793 },
};

/**
 * Exact coordinates for named landmarks and building complexes.
 * When multiple spaces or events are hosted in the same building,
 * they share the exact same building coordinate to demonstrate the
 * building cluster and disambiguation system.
 */
export const LANDMARK_COORDS: Record<string, { lat: number; lng: number }> = {
  // Pasay / Manila Bay Complex
  "SMX Convention Center Manila": { lat: 14.5318, lng: 120.9818 },
  "Mall of Asia Concert Grounds": { lat: 14.5332, lng: 120.9802 },
  "World Trade Center Metro Manila": { lat: 14.5539, lng: 120.9866 },
  "Cultural Center of the Philippines": { lat: 14.5583, lng: 120.9875 },

  // BGC / Taguig
  "The Loft BGC": { lat: 14.5502, lng: 121.0505 },
  "BGC High Street Central": { lat: 14.5516, lng: 121.0514 },
  "Shangri-La The Fort": { lat: 14.5528, lng: 121.0478 },
  "SM Aura Sky Park": { lat: 14.5427, lng: 121.0543 },
  "Uptown Mall BGC": { lat: 14.5564, lng: 121.0542 },

  // Makati CBD
  "Whitespace Manila": { lat: 14.5562, lng: 121.0118 },
  "Makati Diamond Residences": { lat: 14.5531, lng: 121.0205 },
  "Ayala Triangle Gardens": { lat: 14.5574, lng: 121.0232 },
  "Rockwell Power Plant Hall": { lat: 14.5654, lng: 121.0366 },

  // Pasig / Ortigas
  "Reyes Rooftop Pasig": { lat: 14.5861, lng: 121.0622 },
  "Capitol Commons Pavilion": { lat: 14.5762, lng: 121.0665 },
  "Metrowalk Event Arena": { lat: 14.5884, lng: 121.0671 },

  // Quezon City
  "Cubao Expo Creative Hub": { lat: 14.6212, lng: 121.0558 },
  "Eastwood City Open Park": { lat: 14.6111, lng: 121.0805 },
  "QC Memorial Amphitheater": { lat: 14.6517, lng: 121.0494 },

  // Cebu
  "Skyline Cebu IT Park": { lat: 10.3298, lng: 123.9061 },
  "Waterfront Cebu City Hotel": { lat: 10.3255, lng: 123.9069 },

  // Boracay
  "Boracay Beach Resort Station 1": { lat: 11.9712, lng: 121.9189 },
  "Boracay Beachfront Pavilion Station 2": { lat: 11.9615, lng: 121.9264 },

  // Siargao
  "Siargao Surf Pavilion Cloud 9": { lat: 9.8142, lng: 126.1645 },
  "General Luna Lagoon Resort": { lat: 9.7895, lng: 126.1528 },
};

/**
 * Whether `getVenueCoords(name, city)` would resolve to a real, known
 * location rather than its Manila fallback. Callers that previously left
 * lat/lng unset for an unrecognized city (a visible, honest data hole) can
 * use this to keep doing that, instead of getVenueCoords silently handing
 * back a plausible-looking Manila-area pin that masks the same bad data.
 */
export function hasKnownLocation(name: string, city: string): boolean {
  return Boolean(LANDMARK_COORDS[name] || CITY_COORDS[city]);
}

export function getCityOrLandmarkCoords(
  nameOrCity: string,
  fallbackCity = "Manila",
): { lat: number; lng: number } {
  if (LANDMARK_COORDS[nameOrCity]) {
    return LANDMARK_COORDS[nameOrCity];
  }
  if (CITY_COORDS[nameOrCity]) {
    return CITY_COORDS[nameOrCity];
  }
  return CITY_COORDS[fallbackCity] || { lat: 14.5995, lng: 120.9842 };
}

// Deterministic small offset (~0.3-2.8km) so venues sharing a city don't
// stack on one pin. Seeded by name (not random) so re-running the seeder
// produces the exact same coordinates every time.
function jitterCoords(
  base: { lat: number; lng: number },
  seed: string,
): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const angle = (((hash % 360) + 360) % 360) * (Math.PI / 180);
  const distanceKm = 0.3 + (Math.abs(hash >> 8) % 25) / 10;
  const dLat = (distanceKm / 111) * Math.sin(angle);
  const dLng =
    (distanceKm / (111 * Math.cos((base.lat * Math.PI) / 180))) *
    Math.cos(angle);
  return { lat: base.lat + dLat, lng: base.lng + dLng };
}

/**
 * The coordinate a seeded venue/event should actually use: an exact,
 * shared LANDMARK_COORDS entry when `name` names one, or when an explicit
 * `landmark` is given (so a venue whose own display name doesn't happen to
 * match a landmark string can still be deliberately placed at one, letting
 * several differently-named venues share a coordinate to demo the building
 * cluster pin) — otherwise a deterministic small jitter off the city
 * centroid so distinct venues in the same city spread out on the map
 * instead of stacking on one pin.
 */
export function getVenueCoords(
  name: string,
  city: string,
  landmark?: string,
): { lat: number; lng: number } {
  if (landmark && LANDMARK_COORDS[landmark]) return LANDMARK_COORDS[landmark];
  if (LANDMARK_COORDS[name]) return LANDMARK_COORDS[name];
  const base = CITY_COORDS[city] ?? CITY_COORDS.Manila;
  return jitterCoords(base, name);
}

/**
 * Generates a simple rectangular polygon boundary around a center coordinate.
 * Useful for seeding venue footprints so they can be rendered on the map.
 * @param center The center lat/lng
 * @param sizeDegrees The size of the footprint (e.g. 0.0002 for ~20 meters)
 * @returns An array of coordinates representing a closed GeoJSON ring (LngLat format: [lng, lat])
 */
export function generatePolygon(
  center: { lat: number; lng: number },
  sizeDegrees = 0.0002,
): [number, number][] {
  return [
    [center.lng - sizeDegrees, center.lat - sizeDegrees],
    [center.lng + sizeDegrees, center.lat - sizeDegrees],
    [center.lng + sizeDegrees, center.lat + sizeDegrees],
    [center.lng - sizeDegrees, center.lat + sizeDegrees],
    [center.lng - sizeDegrees, center.lat - sizeDegrees], // close the ring
  ];
}

/**
 * Places a venue's boundary without overlapping any boundary already seeded
 * in this run, using the exact same `polygonsOverlap` check the real
 * `VenueSvc.assertNoOverlap` enforces on every create/update. Without this,
 * two seeded venues could silently land on jittered coordinates close enough
 * to overlap (each footprint is only ~44m wide) — invisible until a mayor
 * later edits one of them through the real app and gets a false-positive
 * "overlaps an existing venue" rejection unrelated to their edit.
 *
 * On a collision, nudges outward along the same jitter angle in fixed
 * ~50m steps (deterministic, not random) until clear, then records the
 * final boundary in `placed` so later calls in the same run see it too.
 */
export function resolveNonOverlappingBoundary(
  coords: { lat: number; lng: number },
  placed: LngLat[][],
  sizeDegrees = 0.0002,
): { coords: { lat: number; lng: number }; boundary: LngLat[] } {
  let candidate = coords;
  let boundary = generatePolygon(candidate, sizeDegrees) as LngLat[];
  let attempts = 0;

  while (placed.some((other) => polygonsOverlap(boundary, other))) {
    attempts += 1;
    if (attempts > 20) break; // give up rather than loop forever on bad input
    const stepDeg = 0.00045 * attempts; // ~50m per attempt (111km per degree)
    candidate = {
      lat: coords.lat + stepDeg,
      lng: coords.lng + stepDeg,
    };
    boundary = generatePolygon(candidate, sizeDegrees) as LngLat[];
  }

  placed.push(boundary);
  return { coords: candidate, boundary };
}
