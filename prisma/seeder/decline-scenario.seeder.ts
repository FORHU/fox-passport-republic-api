import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../src/utils/password";
import { assertSchemaIsMigrated } from "../preflight";

/**
 * The decline scenario (api#476, mobile#509, #511, #513).
 *
 * Data for seeing, in the mobile app, how Suppliers saying no reaches the
 * Event Foxer:
 *
 * - Erin (Event Foxer) has a package waiting on its Suppliers: one agreed,
 *   one still deciding, one declined with a reason. (Package status page.)
 * - Vince (Venue and Provider) has requests from Erin to turn down: two
 *   waiting for an answer and one already booked. (Decline sheet, note.)
 * - Erin has a booked event whose Suppliers already left, each with a
 *   reason, two with a note. (Booked event shows the reason and note.)
 *
 * Standalone and additive: it never touches the main seed's data, and running
 * it again resets this scenario to its starting state.
 *
 *   pnpm seed:declines
 *
 * Every account's password is SEED_PASSWORD below, like the main seed.
 */

const SEED_PASSWORD = "Password123!";
// example.com, like the main seed: login validates emails with Joi's
// `.email()`, which rejects reserved endings such as `.test`.
const DOMAIN = "example.com";
const TAG = "(Decline Test)";

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
      "\n❌ Refusing to seed the decline scenario: DATABASE_URL must be a " +
        "local database and NODE_ENV development or test.\n" +
        "   If you really mean it: ALLOW_SEED=1 pnpm seed:declines\n",
    );
    process.exit(1);
  }
}

assertSafeToSeed();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const CAST = {
  // Sign in as Erin to see packages and the booked event.
  erin: { name: "Erin Eventfoxer", roleType: ["eventFoxer"] },
  // Sign in as Vince to decline requests.
  vince: { name: "Vince Venue", roleType: ["venueFoxer", "providerFoxer"] },
  // Another Supplier on Erin's events.
  paula: { name: "Paula Provider", roleType: ["providerFoxer"] },
  // The citizen who booked Erin's event.
  cora: { name: "Cora Citizen", roleType: [] },
} as const;

type CastKey = keyof typeof CAST;
const emailOf = (key: CastKey) => `decline.${key}@${DOMAIN}`;

async function seedCast() {
  const password = await hashPassword(SEED_PASSWORD);
  const ids = {} as Record<CastKey, string>;
  for (const key of Object.keys(CAST) as CastKey[]) {
    const { name, roleType } = CAST[key];
    const user = await prisma.user.upsert({
      where: { email: emailOf(key) },
      update: {
        name,
        roleType: [...roleType],
        password,
        isEmailVerified: true,
      },
      create: {
        email: emailOf(key),
        username: `decline_test_${key}`,
        name,
        password,
        roleType: [...roleType],
        isEmailVerified: true,
        city: "Davao City",
        country: "Philippines",
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
    ids[key] = user.id;
  }
  return ids;
}

async function seedVenue(mayorId: string, name: string, n: number) {
  // Far from every other seeded venue, so its service area overlaps nothing.
  const x = 125.8 + n * 0.01;
  const data = {
    mayorId,
    category: "indoor",
    name: `${name} ${TAG}`,
    description: "A venue for trying declines with a reason.",
    capacity: 120,
    price: 18000 + n * 4000,
    billingRate: "daily" as const,
    address: `${n} River Road, Lanang`,
    city: "Davao City",
    country: "Philippines",
    status: "available" as const,
    boundary: [
      [x, 7.12],
      [x + 0.002, 7.12],
      [x + 0.002, 7.122],
      [x, 7.122],
      [x, 7.12],
    ],
    lat: 7.121,
    lng: x + 0.001,
    spaceType: ["hall"],
    amenities: ["Wi-Fi", "Parking"],
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

async function seedAsset(ownerId: string, name: string, price: number) {
  const data = {
    ownerId,
    category: "audio",
    name: `${name} ${TAG}`,
    description: "Gear for trying declines with a reason.",
    quantity: 4,
    price,
    billingRate: "daily" as const,
    status: "available" as const,
    city: "Davao City",
    country: "Philippines",
  };
  const existing = await prisma.asset.findFirst({
    where: { ownerId, name: data.name },
    select: { id: true },
  });
  const asset = existing
    ? await prisma.asset.update({ where: { id: existing.id }, data })
    : await prisma.asset.create({ data });
  return asset.id;
}

async function seedService(
  ownerId: string,
  name: string,
  category: "photography" | "dj",
  price: number,
) {
  const data = {
    ownerId,
    category,
    name: `${name} ${TAG}`,
    description: "A service for trying declines with a reason.",
    city: "Davao City",
    country: "Philippines",
    tags: [category],
    price,
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

async function upsertEvent(
  ownerId: string,
  clientId: string,
  name: string,
  startAt: Date,
) {
  const fields = {
    name: `${name} ${TAG}`,
    startAt,
    endAt: new Date(startAt.getTime() + 5 * HOUR),
    eventStatus: "pending" as const,
    requestStatus: "approved" as const,
    clientId,
    organizerId: ownerId,
    description: `${name}, seeded by the decline scenario.`,
    eventCategory: "social" as const,
    guestCount: 50,
    totalAmount: 45000,
  };
  const existing = await prisma.event.findFirst({
    where: { organizerId: ownerId, name: fields.name },
    select: { id: true },
  });
  const event = existing
    ? await prisma.event.update({ where: { id: existing.id }, data: fields })
    : await prisma.event.create({ data: fields });
  return event.id;
}

/** Erin's package, waiting on its Suppliers (mobile#509). */
async function seedPackage(
  ownerId: string,
  lines: { venueId: string; assetId: string; serviceId: string },
  now: number,
) {
  const name = `Erin's Wedding package ${TAG}`;
  const fields = {
    ownerId,
    name,
    description: "A package waiting on its Suppliers.",
    category: "social" as const,
    status: "draft" as const,
    targetCity: "Davao City",
    targetCountry: "Philippines",
  };
  const existing = await prisma.eventTemplate.findFirst({
    where: { ownerId, name },
    select: { id: true },
  });
  const template = existing
    ? await prisma.eventTemplate.update({
        where: { id: existing.id },
        data: fields,
      })
    : await prisma.eventTemplate.create({ data: fields });
  const templateId = template.id;
  await prisma.eventTemplateVenue.deleteMany({ where: { templateId } });
  await prisma.eventTemplateAsset.deleteMany({ where: { templateId } });
  await prisma.eventTemplateService.deleteMany({ where: { templateId } });

  // The venue agreed.
  await prisma.eventTemplateVenue.create({
    data: {
      templateId,
      venueId: lines.venueId,
      agreedPrice: 22000,
      matchRequestStatus: "accepted",
      requestedAt: new Date(now - 2 * DAY),
      respondedAt: new Date(now - DAY),
    },
  });
  // The speakers are still deciding, asked a day ago (3 days to answer).
  await prisma.eventTemplateAsset.create({
    data: {
      templateId,
      assetId: lines.assetId,
      quantity: 2,
      agreedPrice: 7000,
      matchRequestStatus: "pending",
      requestedAt: new Date(now - DAY),
    },
  });
  // The DJ declined: the price is too low, with a note.
  await prisma.eventTemplateService.create({
    data: {
      templateId,
      serviceId: lines.serviceId,
      agreedPrice: 8000,
      matchRequestStatus: "declined",
      declineReason: "price_too_low",
      declineNote: "I could do it for 12,000.",
      requestedAt: new Date(now - 2 * DAY),
      respondedAt: new Date(now - 3 * HOUR),
    },
  });
  return templateId;
}

async function main() {
  await assertSchemaIsMigrated(pool);
  console.log("Seeding the decline scenario…");

  const u = await seedCast();
  const now = Date.now();

  const riverside = await seedVenue(u.vince, "Riverside Hall", 1);
  const terrace = await seedVenue(u.vince, "Garden Terrace", 2);
  const speakers = await seedAsset(u.vince, "PA speakers", 3500);
  const photo = await seedService(
    u.vince,
    "Event photography",
    "photography",
    9000,
  );
  const lights = await seedAsset(u.paula, "Stage lights", 2500);
  const dj = await seedService(u.paula, "DJ set", "dj", 8000);

  // Erin's booked event: Cora booked it, and three Suppliers have left.
  const partyId = await upsertEvent(
    u.erin,
    u.cora,
    "Erin's Garden Party",
    new Date(now + 10 * DAY),
  );
  // Vince's requests from Erin: two waiting, one booked.
  const launchId = await upsertEvent(
    u.erin,
    u.erin,
    "Erin's Product Launch",
    new Date(now + 18 * DAY),
  );
  const dinnerId = await upsertEvent(
    u.erin,
    u.erin,
    "Erin's Anniversary Dinner",
    new Date(now + 14 * DAY),
  );
  const eventIds = [partyId, launchId, dinnerId];

  await seedPackage(
    u.erin,
    { venueId: terrace, assetId: speakers, serviceId: dj },
    now,
  );

  // Reset this scenario's own lines, then lay them down again.
  await prisma.eventVenueTransaction.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await prisma.eventAssetTransaction.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await prisma.eventServiceTransaction.deleteMany({
    where: { eventId: { in: eventIds } },
  });

  // Garden Party: the venue stays; the rest left, each saying why.
  const leftAt = new Date(now - 2 * HOUR);
  await prisma.eventVenueTransaction.create({
    data: {
      eventId: partyId,
      venueId: riverside,
      providerId: u.vince,
      status: "approved",
      agreedPrice: 22000,
    },
  });
  await prisma.eventAssetTransaction.create({
    data: {
      eventId: partyId,
      assetId: lights,
      providerId: u.paula,
      quantity: 4,
      status: "rejected",
      rejectionReason: "supplier_declined",
      declineReason: "closed",
      declineNote: "Our truck is in for repairs that week.",
      attentionSince: leftAt,
      agreedPrice: 10000,
    },
  });
  await prisma.eventServiceTransaction.create({
    data: {
      eventId: partyId,
      serviceId: dj,
      providerId: u.paula,
      status: "rejected",
      rejectionReason: "supplier_declined_busy",
      declineReason: "already_booked",
      attentionSince: leftAt,
      agreedPrice: 8000,
    },
  });
  await prisma.eventServiceTransaction.create({
    data: {
      eventId: partyId,
      serviceId: photo,
      providerId: u.vince,
      status: "rejected",
      rejectionReason: "supplier_declined",
      declineReason: "other",
      declineNote: "A family emergency, so sorry.",
      attentionSince: leftAt,
      agreedPrice: 9000,
    },
  });
  // Cora's booking, not paid yet.
  const booking = {
    eventId: partyId,
    userId: u.cora,
    guestCount: 2,
    totalAmount: 2000,
    status: "pending" as const,
    startAt: new Date(now + 10 * DAY),
    endAt: new Date(now + 10 * DAY + 5 * HOUR),
    checkedIn: false,
  };
  await prisma.booking.upsert({
    where: { ticketCode: "DECLINETEST-CORA" },
    update: booking,
    create: { ...booking, ticketCode: "DECLINETEST-CORA" },
  });

  // Product Launch: waiting for Vince's answer (decline → reject).
  const deadline = new Date(now + 2 * DAY);
  await prisma.eventVenueTransaction.create({
    data: {
      eventId: launchId,
      venueId: terrace,
      providerId: u.vince,
      status: "pending_provider_confirmation",
      agreedPrice: 26000,
      confirmationDeadline: deadline,
    },
  });
  await prisma.eventAssetTransaction.create({
    data: {
      eventId: launchId,
      assetId: speakers,
      providerId: u.vince,
      quantity: 2,
      status: "pending_provider_confirmation",
      agreedPrice: 7000,
      confirmationDeadline: deadline,
    },
  });
  // Anniversary Dinner: Vince's venue is booked and not paid, so he can leave
  // it (decline), and Erin then sees why on that event.
  await prisma.eventVenueTransaction.create({
    data: {
      eventId: dinnerId,
      venueId: riverside,
      providerId: u.vince,
      status: "approved",
      agreedPrice: 22000,
    },
  });

  console.log(`
✅ Decline scenario ready. Every password: ${SEED_PASSWORD}

  decline.erin@${DOMAIN}    Erin, Event Foxer
    Packages   "Erin's Wedding package": venue agreed, speakers deciding,
               DJ declined (price too low, with a note) → See status
    Booked     "Erin's Garden Party": lights, DJ and photographer left,
               each with a reason; two with a note
  decline.vince@${DOMAIN}   Vince, Venue and Provider
    Requests   "Erin's Product Launch": venue and speakers waiting → Decline
               "Erin's Anniversary Dinner": venue booked → Decline this booking
               (then sign in as Erin to see the reason on that event)
  decline.paula@${DOMAIN}   Paula, Provider (the lights and DJ)
  decline.cora@${DOMAIN}    Cora, citizen (booked the Garden Party)
`);
}

main()
  .catch((e) => {
    console.error("Decline scenario failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
