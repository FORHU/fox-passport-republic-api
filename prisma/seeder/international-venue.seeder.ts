import {
  PrismaClient,
  VenueStatus,
  BillingRate,
  VenueCategory,
} from "@prisma/client";
import {
  jitterCoords,
  generatePolygon,
  resolveNonOverlappingBoundary,
} from "./city-coords";
import type { LngLat } from "../../src/utils/geo";

/**
 * City centroids for venues seeded outside the Philippines. Kept separate
 * from CITY_COORDS in city-coords.ts (which is PH-only) so the map can be
 * exercised with pins spread across multiple countries/continents instead
 * of everything clustering around Manila.
 */
const INTL_CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Tokyo: { lat: 35.6762, lng: 139.6503 },
  Osaka: { lat: 34.6937, lng: 135.5023 },
  Singapore: { lat: 1.3521, lng: 103.8198 },
  "Hong Kong": { lat: 22.3193, lng: 114.1694 },
  Seoul: { lat: 37.5665, lng: 126.978 },
  Bangkok: { lat: 13.7563, lng: 100.5018 },
  Bali: { lat: -8.3405, lng: 115.092 },
  Jakarta: { lat: -6.2088, lng: 106.8456 },
  "Kuala Lumpur": { lat: 3.139, lng: 101.6869 },
  Dubai: { lat: 25.2048, lng: 55.2708 },
  London: { lat: 51.5072, lng: -0.1276 },
  Paris: { lat: 48.8566, lng: 2.3522 },
  Rome: { lat: 41.9028, lng: 12.4964 },
  "New York": { lat: 40.7128, lng: -74.006 },
  "Los Angeles": { lat: 34.0522, lng: -118.2437 },
  Toronto: { lat: 43.6532, lng: -79.3832 },
  Sydney: { lat: -33.8688, lng: 151.2093 },
};

export async function seedInternationalVenues(
  prisma: PrismaClient,
  host?: any,
) {
  try {
    console.log("Starting international venue seed...");

    let executionHost = host;
    if (!executionHost || !executionHost.id) {
      executionHost = await prisma.user.findFirst({
        where: {
          email: { in: ["host@example.com", "mayor@example.com"] },
        },
      });
    }

    if (!executionHost || !executionHost.id) {
      throw new Error(
        "Could not find a user with email 'host@example.com' or 'mayor@example.com' in the database.",
      );
    }

    const venues: any[] = [
      {
        name: "Shibuya Sky Terrace",
        description:
          "Panoramic rooftop event space overlooking the Shibuya crossing skyline.",
        category: VenueCategory.mix,
        capacity: 150,
        price: 3500,
        billingRate: BillingRate.daily,
        address: "2-24-12 Shibuya",
        city: "Tokyo",
        state: "Tokyo",
        country: "Japan",
        status: VenueStatus.available,
        spaceType: ["rooftop", "sky lounge"],
        amenities: ["climate control", "elevator access", "restrooms"],
        techAv: ["led wall", "sound system"],
        staffing: ["security", "concierge"],
        policies: ["no outside catering", "venue hours 10am-10pm"],
      },
      {
        name: "Namba Grand Hall",
        description:
          "Modern function hall in the heart of Osaka's entertainment district.",
        category: VenueCategory.indoor,
        capacity: 300,
        price: 4200,
        billingRate: BillingRate.daily,
        address: "1-1 Namba",
        city: "Osaka",
        state: "Osaka",
        country: "Japan",
        status: VenueStatus.available,
        spaceType: ["function hall", "indoor"],
        amenities: ["air conditioning", "parking", "restrooms"],
        techAv: ["full AV system", "wireless mics"],
        staffing: ["security", "janitor"],
        policies: ["no smoking", "venue hours 9am-11pm"],
      },
      {
        name: "Marina Bay Sky Pavilion",
        description:
          "Glass-walled pavilion with sweeping views of Marina Bay's skyline.",
        category: VenueCategory.hotel,
        capacity: 400,
        price: 8000,
        billingRate: BillingRate.daily,
        address: "10 Bayfront Ave",
        city: "Singapore",
        state: "Singapore",
        country: "Singapore",
        status: VenueStatus.available,
        spaceType: ["ballroom", "sky pavilion"],
        amenities: ["central air conditioning", "valet parking", "vip lounge"],
        techAv: ["concert sound system", "led ceiling"],
        staffing: ["hotel security", "banquet manager"],
        policies: ["strict dress code", "venue hours 9am-1am"],
      },
      {
        name: "Victoria Harbour Deck",
        description:
          "Waterfront open-air deck facing the Hong Kong Island skyline.",
        category: VenueCategory.outdoor,
        capacity: 200,
        price: 6000,
        billingRate: BillingRate.daily,
        address: "10 Salisbury Rd, Tsim Sha Tsui",
        city: "Hong Kong",
        state: "Kowloon",
        country: "Hong Kong",
        status: VenueStatus.available,
        spaceType: ["deck", "waterfront outdoor"],
        amenities: ["harbor view", "restrooms", "bar counter"],
        techAv: ["weatherproof sound system"],
        staffing: ["security"],
        policies: ["no fireworks", "event hours 4pm-12am"],
      },
      {
        name: "Gangnam Rooftop Lounge",
        description:
          "Trendy rooftop lounge in Seoul's Gangnam district, popular for product launches.",
        category: VenueCategory.mix,
        capacity: 120,
        price: 2800,
        billingRate: BillingRate.daily,
        address: "396 Gangnam-daero",
        city: "Seoul",
        state: "Seoul",
        country: "South Korea",
        status: VenueStatus.available,
        spaceType: ["rooftop", "lounge"],
        amenities: ["bar area", "restrooms", "elevator access"],
        techAv: ["led wall", "dj booth"],
        staffing: ["security", "bartender"],
        policies: ["no outside alcohol", "venue hours 6pm-2am"],
      },
      {
        name: "Chao Phraya River Pavilion",
        description:
          "Riverside open-air pavilion with traditional Thai architectural accents.",
        category: VenueCategory.outdoor,
        capacity: 250,
        price: 2200,
        billingRate: BillingRate.daily,
        address: "Charoen Krung Rd",
        city: "Bangkok",
        state: "Bangkok",
        country: "Thailand",
        status: VenueStatus.available,
        spaceType: ["riverside pavilion", "outdoor"],
        amenities: ["river view", "restrooms", "catering kitchen"],
        techAv: ["sound system", "stage lighting"],
        staffing: ["security", "event coordinator"],
        policies: ["no littering in river", "venue hours 8am-11pm"],
      },
      {
        name: "Ubud Rice Terrace Retreat",
        description:
          "Tranquil open-air venue nestled among the rice terraces of Ubud.",
        category: VenueCategory.garden,
        capacity: 80,
        price: 1800,
        billingRate: BillingRate.daily,
        address: "Jalan Raya Ubud",
        city: "Bali",
        state: "Bali",
        country: "Indonesia",
        status: VenueStatus.available,
        spaceType: ["garden", "terrace"],
        amenities: ["scenic view", "restrooms", "prep cabins"],
        techAv: ["bluetooth sound"],
        staffing: ["groundskeeper"],
        policies: ["daytime bookings only", "no plastic waste"],
      },
      {
        name: "Jakarta Convention Atrium",
        description:
          "Large atrium space for conferences and trade shows in central Jakarta.",
        category: VenueCategory.indoor,
        capacity: 600,
        price: 5500,
        billingRate: BillingRate.daily,
        address: "Jl. Gatot Subroto",
        city: "Jakarta",
        state: "Jakarta",
        country: "Indonesia",
        status: VenueStatus.pending,
        spaceType: ["atrium", "convention space"],
        amenities: ["high speed wifi", "air conditioning", "loading dock"],
        techAv: ["video conferencing system", "laser projector"],
        staffing: ["it support", "security"],
        policies: ["corporate attire required"],
      },
      {
        name: "Petronas Skybridge Hall",
        description:
          "Executive event hall with a direct view of the Petronas Twin Towers.",
        category: VenueCategory.hotel,
        capacity: 180,
        price: 4800,
        billingRate: BillingRate.daily,
        address: "Jalan Ampang",
        city: "Kuala Lumpur",
        state: "Kuala Lumpur",
        country: "Malaysia",
        status: VenueStatus.available,
        spaceType: ["hotel hall", "skyline view"],
        amenities: ["luxury plush carpets", "concealed restrooms"],
        techAv: ["automated projector system"],
        staffing: ["butler service", "concierge"],
        policies: ["exclusively internal catering packages only"],
      },
      {
        name: "Palm Jumeirah Beach Club",
        description:
          "Exclusive beachfront club venue on the Palm Jumeirah with private cabanas.",
        category: VenueCategory.beach_resort,
        capacity: 300,
        price: 12000,
        billingRate: BillingRate.daily,
        address: "Crescent Rd, Palm Jumeirah",
        city: "Dubai",
        state: "Dubai",
        country: "United Arab Emirates",
        status: VenueStatus.available,
        spaceType: ["beach club", "private cove"],
        amenities: ["infinity pool access", "cabanas", "restrooms"],
        techAv: ["outdoor intelligent stage lights"],
        staffing: ["maritime security", "resort crew"],
        policies: ["no glass bottles on beach"],
      },
      {
        name: "The Shard Sky Hall",
        description:
          "High-floor event hall with panoramic views over the River Thames.",
        category: VenueCategory.hotel,
        capacity: 220,
        price: 9000,
        billingRate: BillingRate.daily,
        address: "32 London Bridge St",
        city: "London",
        state: "England",
        country: "United Kingdom",
        status: VenueStatus.available,
        spaceType: ["sky hall", "hotel"],
        amenities: ["central air conditioning", "vip lounge"],
        techAv: ["motorized truss", "concert sound system"],
        staffing: ["hotel security", "banquet manager"],
        policies: ["strict dress code", "venue hours 9am-12am"],
      },
      {
        name: "Le Marais Courtyard Hall",
        description:
          "Elegant 19th-century courtyard hall in the historic Le Marais district.",
        category: VenueCategory.indoor,
        capacity: 160,
        price: 7000,
        billingRate: BillingRate.daily,
        address: "Rue des Francs-Bourgeois",
        city: "Paris",
        state: "Ile-de-France",
        country: "France",
        status: VenueStatus.available,
        spaceType: ["courtyard hall", "heritage building"],
        amenities: ["air conditioning", "restrooms", "prep kitchen"],
        techAv: ["sound system", "ambient lighting"],
        staffing: ["security", "janitor"],
        policies: ["no alterations to historic walls"],
      },
      {
        name: "Piazza Navona Terrace",
        description:
          "Rooftop terrace overlooking the fountains of Piazza Navona.",
        category: VenueCategory.outdoor,
        capacity: 90,
        price: 5000,
        billingRate: BillingRate.daily,
        address: "Piazza Navona",
        city: "Rome",
        state: "Lazio",
        country: "Italy",
        status: VenueStatus.available,
        spaceType: ["terrace", "rooftop"],
        amenities: ["bistro seating", "restrooms"],
        techAv: ["weatherproof sound system"],
        staffing: ["security"],
        policies: ["event hours 5pm-1am"],
      },
      {
        name: "Manhattan Skyline Loft",
        description:
          "Industrial-chic loft space with floor-to-ceiling windows overlooking Midtown Manhattan.",
        category: VenueCategory.indoor,
        capacity: 200,
        price: 10000,
        billingRate: BillingRate.daily,
        address: "5th Ave",
        city: "New York",
        state: "New York",
        country: "United States",
        status: VenueStatus.available,
        spaceType: ["loft", "indoor"],
        amenities: ["air conditioning", "elevator", "bar area"],
        techAv: ["projector", "sound system", "led walls"],
        staffing: ["security", "concierge"],
        policies: ["no outside alcohol", "venue hours 10am-2am"],
      },
      {
        name: "Hollywood Hills Garden Estate",
        description:
          "Sprawling hillside garden estate with sweeping views of the LA skyline.",
        category: VenueCategory.garden,
        capacity: 250,
        price: 15000,
        billingRate: BillingRate.daily,
        address: "Mulholland Dr",
        city: "Los Angeles",
        state: "California",
        country: "United States",
        status: VenueStatus.available,
        spaceType: ["garden estate", "hillside lawn"],
        amenities: ["viewpoint deck", "restrooms", "parking"],
        techAv: ["distributed light strings"],
        staffing: ["security", "groundskeeper"],
        policies: ["event load out by 10pm"],
      },
      {
        name: "Harbourfront Convention Deck",
        description:
          "Modern waterfront deck along Toronto's harbourfront, ideal for corporate galas.",
        category: VenueCategory.mix,
        capacity: 280,
        price: 8500,
        billingRate: BillingRate.daily,
        address: "235 Queens Quay W",
        city: "Toronto",
        state: "Ontario",
        country: "Canada",
        status: VenueStatus.pending,
        spaceType: ["waterfront deck", "convention space"],
        amenities: ["lake view", "restrooms", "catering kitchen"],
        techAv: ["surround sound", "stage lighting"],
        staffing: ["security", "maintenance tech"],
        policies: ["venue hours 8am-11pm"],
      },
      {
        name: "Darling Harbour Pavilion",
        description:
          "Open-air pavilion on Sydney's Darling Harbour with skyline and water views.",
        category: VenueCategory.outdoor,
        capacity: 320,
        price: 9500,
        billingRate: BillingRate.daily,
        address: "Darling Dr",
        city: "Sydney",
        state: "New South Wales",
        country: "Australia",
        status: VenueStatus.available,
        spaceType: ["pavilion", "waterfront outdoor"],
        amenities: ["harbor view", "restrooms", "bar counter"],
        techAv: ["outdoor screen", "sound system"],
        staffing: ["security", "lifeguard"],
        policies: ["no glass on the promenade"],
      },
    ];

    const placedBoundaries: LngLat[][] = [];

    for (const v of venues) {
      const venueId = `seed-venue-intl-${v.name.trim().toLowerCase().replace(/\s+/g, "-")}`;
      const base = INTL_CITY_COORDS[v.city] ?? INTL_CITY_COORDS.Tokyo;
      const rawCoords = jitterCoords(base, v.name);
      const { coords, boundary } = resolveNonOverlappingBoundary(
        rawCoords,
        placedBoundaries,
      );

      await prisma.venue.upsert({
        where: { id: venueId },
        update: {
          ...v,
          lat: coords.lat,
          lng: coords.lng,
          boundary,
          mayorId: executionHost.id,
        },
        create: {
          id: venueId,
          ...v,
          lat: coords.lat,
          lng: coords.lng,
          boundary,
          mayorId: executionHost.id,
        },
      });
      console.log(`✓ Seeded international venue: ${v.name} (${v.country})`);
    }

    console.log("✅ International venue seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error seeding international venues:", error);
    throw error;
  }
}
