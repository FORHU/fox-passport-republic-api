import { EventCategory, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const CITIES = [
  { city: "New York", country: "United States", lat: 40.7128, lng: -74.006 },
  { city: "Toronto", country: "Canada", lat: 43.6532, lng: -79.3832 },
  { city: "Mexico City", country: "Mexico", lat: 19.4326, lng: -99.1332 },
  { city: "Rio de Janeiro", country: "Brazil", lat: -22.9068, lng: -43.1729 },
  { city: "London", country: "United Kingdom", lat: 51.5072, lng: -0.1276 },
  { city: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { city: "Berlin", country: "Germany", lat: 52.52, lng: 13.405 },
  { city: "Madrid", country: "Spain", lat: 40.4168, lng: -3.7038 },
  { city: "Rome", country: "Italy", lat: 41.9028, lng: 12.4964 },
  { city: "Cairo", country: "Egypt", lat: 30.0444, lng: 31.2357 },
  { city: "Nairobi", country: "Kenya", lat: -1.2921, lng: 36.8219 },
  { city: "Cape Town", country: "South Africa", lat: -33.9249, lng: 18.4241 },
  {
    city: "Dubai",
    country: "United Arab Emirates",
    lat: 25.2048,
    lng: 55.2708,
  },
  { city: "Mumbai", country: "India", lat: 19.076, lng: 72.8777 },
  { city: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018 },
  { city: "Singapore", country: "Singapore", lat: 1.3521, lng: 103.8198 },
  { city: "Tokyo", country: "Japan", lat: 35.6762, lng: 139.6503 },
  { city: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.978 },
  { city: "Sydney", country: "Australia", lat: -33.8688, lng: 151.2093 },
  { city: "Auckland", country: "New Zealand", lat: -36.8509, lng: 174.7645 },
  { city: "Istanbul", country: "Türkiye", lat: 41.0082, lng: 28.9784 },
  { city: "Amsterdam", country: "Netherlands", lat: 52.3676, lng: 4.9041 },
  { city: "Jakarta", country: "Indonesia", lat: -6.2088, lng: 106.8456 },
  { city: "Kuala Lumpur", country: "Malaysia", lat: 3.139, lng: 101.6869 },
] as const;

const CATEGORIES = [
  EventCategory.wedding,
  EventCategory.birthday,
  EventCategory.corporate,
  EventCategory.social,
  EventCategory.other,
] as const;

const EVENTS_PER_CITY = 10;

export function buildGlobeStressEventData(ownerId: string) {
  return CITIES.flatMap((city) =>
    Array.from({ length: EVENTS_PER_CITY }, (_, eventIndex) => {
      const category = CATEGORIES[eventIndex % CATEGORIES.length];
      const categoryName = category.replace(/^./, (first) =>
        first.toUpperCase(),
      );
      const sequence = String(eventIndex + 1).padStart(2, "0");

      return {
        id: randomUUID(),
        ownerId,
        name: `Globe Load Test · ${categoryName} · ${city.city} ${sequence}`,
        description:
          "Synthetic, development-only listing used to test event density and location aggregation on the rotating landing-page globe.",
        category,
        status: "published" as const,
        isPublic: true,
        targetCity: city.city,
        targetCountry: city.country,
        lat: city.lat,
        lng: city.lng,
      };
    }),
  );
}

export async function seedGlobeStressEvents(
  prisma: PrismaClient,
  ownerId: string,
) {
  const data = buildGlobeStressEventData(ownerId);
  const result = await prisma.eventTemplate.createMany({
    data,
    skipDuplicates: true,
  });

  console.log(
    `Globe stress seed: ${result.count} templates across ${CITIES.length} cities in ` +
      `${new Set(CITIES.map((city) => city.country)).size} countries ` +
      `(${data.length} total fixtures).`,
  );
  return result.count;
}
