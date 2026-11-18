import "dotenv/config";
import { PrismaClient, RoleType } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../src/utils/password";
import { assertSchemaIsMigrated } from "../preflight";

/**
 * The Paws leaderboard scenario.
 *
 * Fills the Foxer leaderboard so every tab, filter and label can be seen:
 * Venues, Events and Providers in three cities, each Foxer with a listing,
 * completed bookings and reviews, so the board shows a spread of Paws, one Foxer
 * with too few reviews ("New"), and some newer accounts for Rising.
 *
 * Standalone and additive: it never touches the main seed's data, and running
 * it again resets only its own rows.
 *
 *   pnpm seed:paws
 *
 * Every account's password is SEED_PASSWORD below, like the other seeds.
 * The board is cached for five minutes, so it can take that long to show.
 */

const SEED_PASSWORD = "Password123!";
// example.com, like the main seed: login validates emails with Joi's
// `.email()`, which rejects reserved endings such as `.test`.
const DOMAIN = "example.com";
const TAG = "(Paws Test)";
const ID_PREFIX = "paws-";

// Same rule as prisma/seed.ts: these are real logins with a password committed
// to the repository, so only ever write them to a local database.
const LOCAL_DB_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "local_postgres",
]);

function assertSafeToSeed() {
  if (process.env.ALLOW_SEED === "1") return;
  const url = process.env.DATABASE_URL;
  const env = process.env.NODE_ENV ?? "development";
  let host = "";
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    // falls through to the refusal below
  }
  if (
    !url ||
    (env !== "development" && env !== "test") ||
    !LOCAL_DB_HOSTS.has(host)
  ) {
    console.error(
      "\n❌ Refusing to seed the Paws scenario: DATABASE_URL must be a " +
        "local database and NODE_ENV development or test.\n" +
        "   If you really mean it: ALLOW_SEED=1 pnpm seed:paws\n",
    );
    process.exit(1);
  }
}

assertSafeToSeed();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DAY = 24 * 60 * 60 * 1000;

const CITIES = {
  Manila: { country: "Philippines", lat: 14.5547, lng: 121.0244 },
  "Cebu City": { country: "Philippines", lat: 10.3157, lng: 123.8854 },
  "Davao City": { country: "Philippines", lat: 7.1907, lng: 125.4553 },
} as const;
type City = keyof typeof CITIES;

type Kind = "venue" | "event" | "service";

interface FoxerSpec {
  key: string;
  name: string;
  kind: Kind;
  city: City;
  /** How many reviews it has, and about what they average. */
  reviews: number;
  average: number;
  /** Months since the account was made; under 6 shows on Rising. */
  monthsOld: number;
  /** Services only. */
  category?: "photography" | "videography" | "dj";
  specialties?: string[];
}

// Paws show from five reviews on; the leaderboard needs three completed
// bookings to list a Foxer at all. Each review here sits on one completed
// booking, so "reviews" is also the number of completed bookings.
const FOXERS: FoxerSpec[] = [
  {
    key: "glass",
    name: "Glass Pavilion",
    kind: "venue",
    city: "Manila",
    reviews: 21,
    average: 4.9,
    monthsOld: 14,
  },
  {
    key: "harbor",
    name: "Harbor Loft",
    kind: "venue",
    city: "Manila",
    reviews: 12,
    average: 4.6,
    monthsOld: 11,
  },
  {
    key: "mill",
    name: "Old Mill Hall",
    kind: "venue",
    city: "Cebu City",
    reviews: 8,
    average: 4.4,
    monthsOld: 9,
  },
  {
    // Too few reviews for Paws: shows "New".
    key: "terrace",
    name: "Sunrise Terrace",
    kind: "venue",
    city: "Davao City",
    reviews: 4,
    average: 4.5,
    monthsOld: 2,
  },
  {
    key: "market",
    name: "Night Market Collective",
    kind: "event",
    city: "Manila",
    reviews: 18,
    average: 4.8,
    monthsOld: 13,
  },
  {
    key: "fiesta",
    name: "Weekend Fiesta Co.",
    kind: "event",
    city: "Cebu City",
    reviews: 9,
    average: 4.5,
    monthsOld: 4,
  },
  {
    key: "lanterns",
    name: "Lanterns and Co",
    kind: "event",
    city: "Davao City",
    reviews: 6,
    average: 4.2,
    monthsOld: 3,
  },
  {
    key: "studio",
    name: "Sample Studio",
    kind: "service",
    city: "Manila",
    category: "photography",
    specialties: ["photography", "videography"],
    reviews: 32,
    average: 4.8,
    monthsOld: 12,
  },
  {
    key: "frame",
    name: "Frame and Flow",
    kind: "service",
    city: "Cebu City",
    category: "videography",
    specialties: ["videography"],
    reviews: 14,
    average: 4.7,
    monthsOld: 5,
  },
  {
    key: "beat",
    name: "Beat Lab DJs",
    kind: "service",
    city: "Davao City",
    category: "dj",
    specialties: ["dj"],
    reviews: 7,
    average: 4.3,
    monthsOld: 2,
  },
];

const ROLE_OF: Record<Kind, RoleType> = {
  venue: RoleType.venueFoxer,
  event: RoleType.eventFoxer,
  service: RoleType.providerFoxer,
};

const emailOf = (key: string) => `paws.${key}@${DOMAIN}`;

/** `n` ratings of 3 to 5 that average close to `average`. */
function ratingsFor(n: number, average: number): number[] {
  const ratings = Array<number>(n).fill(5);
  const deficit = Math.round((5 - average) * n);
  for (let i = 0; i < deficit; i++) {
    const idx = (i * 3) % n;
    ratings[idx] = Math.max(3, ratings[idx] - 1);
  }
  return ratings;
}

async function seedUser(
  key: string,
  name: string,
  roleType: RoleType[],
  city: City,
  monthsOld: number,
) {
  const password = await hashPassword(SEED_PASSWORD);
  const createdAt = new Date(Date.now() - monthsOld * 30 * DAY);
  const user = await prisma.user.upsert({
    where: { email: emailOf(key) },
    update: {
      name,
      roleType,
      password,
      isEmailVerified: true,
      city,
      createdAt,
    },
    create: {
      email: emailOf(key),
      username: `paws_test_${key}`,
      name,
      password,
      roleType,
      isEmailVerified: true,
      city,
      country: CITIES[city].country,
      createdAt,
    },
    select: { id: true },
  });
  // Login goes through Better Auth, which reads the password from the
  // credential Account, not from the User row.
  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
    select: { id: true },
  });
  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: { password },
    });
  } else {
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password,
      },
    });
  }
  return user.id;
}

async function seedVenue(mayorId: string, spec: FoxerSpec, index: number) {
  const c = CITIES[spec.city];
  // Each venue gets its own patch of map, so no service areas overlap.
  const x = c.lng + index * 0.02;
  const y = c.lat;
  const boundary = [
    [x, y],
    [x + 0.002, y],
    [x + 0.002, y + 0.002],
    [x, y + 0.002],
    [x, y],
  ];
  const data = {
    mayorId,
    category: "indoor",
    name: `${spec.name} ${TAG}`,
    description: "A venue seeded to fill the leaderboard.",
    capacity: 150,
    price: 20000,
    billingRate: "daily" as const,
    address: `${index + 1} Seed Street`,
    city: spec.city,
    country: c.country,
    status: "available" as const,
    boundary,
    lat: y + 0.001,
    lng: x + 0.001,
    spaceType: ["hall"],
    amenities: ["Wi-Fi"],
  };
  const existing = await prisma.venue.findFirst({
    where: { mayorId, name: data.name },
    select: { id: true },
  });
  const venue = existing
    ? await prisma.venue.update({ where: { id: existing.id }, data })
    : await prisma.venue.create({ data });
  return venue.id;
}

async function seedService(ownerId: string, spec: FoxerSpec) {
  const data = {
    ownerId,
    category: spec.category ?? "photography",
    name: `${spec.name} ${TAG}`,
    description: "A listing seeded to fill the leaderboard.",
    city: spec.city,
    country: CITIES[spec.city].country,
    tags: [spec.category ?? "photography"],
    price: 8000,
    billingRate: "one_time" as const,
    status: "available" as const,
  };
  const existing = await prisma.service.findFirst({
    where: { ownerId, name: data.name },
    select: { id: true },
  });
  const service = existing
    ? await prisma.service.update({ where: { id: existing.id }, data })
    : await prisma.service.create({ data });
  return service.id;
}

async function seedEvent(
  organizerId: string,
  clientId: string,
  name: string,
  startAt: Date,
) {
  const fields = {
    name: `${name} ${TAG}`,
    clientId,
    organizerId,
    description: `${name} — seeded to fill the leaderboard.`,
    startAt,
    endAt: new Date(startAt.getTime() + 4 * 60 * 60 * 1000),
    eventStatus: "completed" as const,
    requestStatus: "approved" as const,
    eventCategory: "social" as const,
    guestCount: 60,
    totalAmount: 40000,
  };
  const existing = await prisma.event.findFirst({
    where: { organizerId, name: fields.name },
    select: { id: true },
  });
  const event = existing
    ? await prisma.event.update({ where: { id: existing.id }, data: fields })
    : await prisma.event.create({ data: fields });
  return event.id;
}

/** Removes what an earlier run made, so a run starts from the same place. */
async function resetOwnRows() {
  const own = { id: { startsWith: ID_PREFIX } };
  await prisma.review.deleteMany({ where: own });
  await prisma.eventVenueTransaction.deleteMany({ where: own });
  await prisma.booking.deleteMany({ where: own });
  await prisma.serviceBooking.deleteMany({ where: own });
}

async function main() {
  await assertSchemaIsMigrated(pool);
  console.log("Seeding the Paws leaderboard scenario…");

  await resetOwnRows();

  // People who book and review, and a host whose events the venues are held at
  // (no Foxer role, so none of them is on the board).
  const clients: string[] = [];
  for (let i = 1; i <= 6; i++) {
    clients.push(
      await seedUser(`client${i}`, `Paws Client ${i}`, [], "Manila", 8),
    );
  }
  const hostId = await seedUser("host", "Paws Host", [], "Manila", 8);

  const now = Date.now();
  let venueIndex = 0;
  let bookingCount = 0;

  for (const spec of FOXERS) {
    const foxerId = await seedUser(
      spec.key,
      spec.name,
      [ROLE_OF[spec.kind]],
      spec.city,
      spec.monthsOld,
    );
    const ratings = ratingsFor(spec.reviews, spec.average);

    if (spec.specialties?.length) {
      for (const category of spec.specialties) {
        await prisma.foxerSpecialization.upsert({
          where: {
            userId_roleType_category: {
              userId: foxerId,
              roleType: RoleType.providerFoxer,
              category,
            },
          },
          update: {},
          create: {
            userId: foxerId,
            roleType: RoleType.providerFoxer,
            category,
            source: "declared",
          },
        });
      }
    }

    let venueId = "";
    let serviceId = "";
    let eventId = "";
    let hostEventId = "";
    if (spec.kind === "venue") {
      venueId = await seedVenue(foxerId, spec, venueIndex++);
      hostEventId = await seedEvent(
        hostId,
        clients[0],
        `${spec.name} hosted night`,
        new Date(now - 60 * DAY),
      );
    } else if (spec.kind === "service") {
      serviceId = await seedService(foxerId, spec);
    } else {
      eventId = await seedEvent(
        foxerId,
        clients[0],
        spec.name,
        new Date(now - 60 * DAY),
      );
    }

    for (let i = 0; i < ratings.length; i++) {
      const id = `${ID_PREFIX}${spec.key}-${i + 1}`;
      const clientId = clients[i % clients.length];
      // Spread over the last three months.
      const when = new Date(now - (3 + ((i * 7) % 85)) * DAY);
      const reviewFields = {
        userId: clientId,
        rating: ratings[i],
        comment: ratings[i] >= 5 ? "Wonderful, would book again." : "Good.",
        createdAt: when,
      };

      if (spec.kind === "service") {
        await prisma.serviceBooking.create({
          data: {
            id,
            serviceId,
            userId: clientId,
            scheduledDate: when,
            location: spec.city,
            totalAmount: 8000,
            status: "completed",
            paymentStatus: "paid",
            createdAt: when,
          },
        });
        await prisma.review.create({
          data: {
            id,
            ...reviewFields,
            entityId: serviceId,
            entityType: "service",
          },
        });
      } else {
        await prisma.booking.create({
          data: {
            id,
            eventId: spec.kind === "event" ? eventId : hostEventId,
            userId: clientId,
            guestCount: 2,
            totalAmount: 2000,
            status: "completed",
            startAt: when,
            endAt: new Date(when.getTime() + 3 * 60 * 60 * 1000),
            ticketCode: `PAWS-${spec.key.toUpperCase()}-${i + 1}`,
            hasReview: true,
            checkedIn: true,
            createdAt: when,
          },
        });
        if (spec.kind === "venue") {
          // A venue's completed bookings are the ones that paid it.
          await prisma.eventVenueTransaction.create({
            data: {
              id,
              eventId: hostEventId,
              bookingId: id,
              venueId,
              providerId: foxerId,
              status: "approved",
              agreedPrice: 2000,
            },
          });
        }
        await prisma.review.create({
          data: {
            id,
            ...reviewFields,
            bookingId: id,
            entityId: spec.kind === "venue" ? venueId : eventId,
            entityType: spec.kind,
          },
        });
      }
      bookingCount++;
    }
  }

  console.log(`
Paws leaderboard scenario ready: ${FOXERS.length} Foxers, ${bookingCount} completed bookings with a review each.
Password for every account: ${SEED_PASSWORD}

  Venues     paws.glass@${DOMAIN} (Manila, 21 reviews)  paws.harbor@${DOMAIN}
             paws.mill@${DOMAIN}  paws.terrace@${DOMAIN} (4 reviews: "New")
  Events     paws.market@${DOMAIN}  paws.fiesta@${DOMAIN}  paws.lanterns@${DOMAIN}
  Providers  paws.studio@${DOMAIN}  paws.frame@${DOMAIN}  paws.beat@${DOMAIN}

The board is cached for five minutes; open Leaderboard after that, or restart
the API's Redis to see it at once.
`);
}

main()
  .catch((e) => {
    console.error("Paws leaderboard scenario failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
