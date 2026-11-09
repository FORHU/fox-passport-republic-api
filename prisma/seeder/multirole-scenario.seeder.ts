import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../src/utils/password";
import {
  EVENT_ORGANIZER_PERMISSIONS,
  VENUE_ORGANIZER_PERMISSIONS,
} from "../../src/types/permissions";
import { assertSchemaIsMigrated } from "../preflight";

/**
 * The multi-role scenario.
 *
 * One login that holds every Foxer role at once (Venue, Event, Gear, Talent,
 * Performer) plus Organizer, with data behind each space, so every dashboard
 * in the mobile app can be seen filled: listings, requests waiting for an
 * answer, an event happening now, payouts over the last eight weeks, and an
 * Organizer invitation.
 *
 * Standalone and additive: it never touches the main seed's data, and running
 * it again resets this scenario to its starting state.
 *
 *   pnpm seed:multirole
 *
 * Every account's password is SEED_PASSWORD below, like the main seed.
 */

const SEED_PASSWORD = "Password123!";
// example.com, like the main seed: login validates emails with Joi's
// `.email()`, which rejects reserved endings such as `.test`.
const DOMAIN = "example.com";
const TAG = "(Multirole Test)";

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
      "\n❌ Refusing to seed the multi-role scenario: DATABASE_URL must be a " +
        "local database and NODE_ENV development or test.\n" +
        "   If you really mean it: ALLOW_SEED=1 pnpm seed:multirole\n",
    );
    process.exit(1);
  }
}

assertSafeToSeed();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const CAST = {
  // The account to sign in with.
  multi: {
    name: "Mika Multirole",
    roleType: ["venueFoxer", "eventFoxer", "providerFoxer", "organizer"],
  },
  // A client who asks Mika for things.
  client: { name: "Cora Client", roleType: [] },
  // An event owner who invites Mika as Organizer.
  host: { name: "Hugo Host", roleType: ["eventFoxer"] },
  rosa: { name: "Rosa Guest", roleType: [] },
  gino: { name: "Gino Guest", roleType: [] },
} as const;

type CastKey = keyof typeof CAST;
const emailOf = (key: CastKey) => `multi.${key}@${DOMAIN}`;

async function seedCast() {
  const password = await hashPassword(SEED_PASSWORD);
  const ids = {} as Record<CastKey, string>;
  for (const key of Object.keys(CAST) as CastKey[]) {
    const { name, roleType } = CAST[key];
    const user = await prisma.user.upsert({
      where: { email: emailOf(key) },
      // Reset the roles too, so a run after an admin removed one puts it back.
      update: {
        name,
        roleType: [...roleType],
        password,
        isEmailVerified: true,
      },
      create: {
        email: emailOf(key),
        username: `multi_test_${key}`,
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

async function seedVenue(mayorId: string, n: 1 | 2) {
  // Far from every other seeded venue, so its service area overlaps nothing.
  const x = 125.7 + n * 0.01;
  const boundary = [
    [x, 7.1],
    [x + 0.002, 7.1],
    [x + 0.002, 7.102],
    [x, 7.102],
    [x, 7.1],
  ];
  const data = {
    mayorId,
    category: "indoor",
    name: `Harbour Hall ${n} ${TAG}`,
    description: "A hall for trying the Venue space with real data.",
    capacity: 150,
    price: 20000 + n * 5000,
    billingRate: "daily" as const,
    address: `${n} Harbour Road, Lanang`,
    city: "Davao City",
    country: "Philippines",
    status: "available" as const,
    boundary,
    lat: 7.101,
    lng: x + 0.001,
    spaceType: ["hall"],
    amenities: ["Wi-Fi", "Sound system"],
    acceptsOrganizerRequests: true,
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
    description: "Gear for trying the Gear space with real data.",
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
  category: "photography" | "videography" | "dj" | "live_band" | "mc",
  price: number,
) {
  const data = {
    ownerId,
    category,
    name: `${name} ${TAG}`,
    description: "A listing for trying the Talent and Performer spaces.",
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
  data: {
    name: string;
    startAt: Date;
    endAt: Date;
    eventStatus: "pending" | "ongoing";
    requestStatus: "pending" | "approved";
    acceptsOrganizerRequests?: boolean;
  },
) {
  const fields = {
    ...data,
    name: `${data.name} ${TAG}`,
    clientId,
    organizerId: ownerId,
    description: `${data.name} — seeded by the multi-role scenario.`,
    eventCategory: "social" as const,
    guestCount: 60,
    totalAmount: 40000,
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

async function seedHugoSlots(hostId: string, eventId: string) {
  const name = `Hugo's Reunion package ${TAG}`;
  const fields = {
    ownerId: hostId,
    name,
    description:
      "A package with open slots, seeded by the multi-role scenario.",
    category: "social" as const,
    status: "published" as const,
    isPublic: true,
    targetCity: "Davao City",
    targetCountry: "Philippines",
  };
  const existing = await prisma.eventTemplate.findFirst({
    where: { ownerId: hostId, name },
    select: { id: true },
  });
  const template = existing
    ? await prisma.eventTemplate.update({
        where: { id: existing.id },
        data: fields,
      })
    : await prisma.eventTemplate.create({ data: fields });
  // Start the slots over, so earlier bids do not linger.
  await prisma.eventServiceBid.deleteMany({ where: { eventId } });
  await prisma.eventAssetBid.deleteMany({ where: { eventId } });
  await prisma.eventTemplateService.deleteMany({
    where: { templateId: template.id },
  });
  await prisma.eventTemplateAsset.deleteMany({
    where: { templateId: template.id },
  });
  await prisma.eventTemplateService.create({
    data: {
      templateId: template.id,
      description: "A DJ for the night",
      agreedPrice: 8000,
    },
  });
  await prisma.eventTemplateAsset.create({
    data: {
      templateId: template.id,
      description: "Sound system",
      quantity: 1,
      agreedPrice: 4000,
    },
  });
  await prisma.event.update({
    where: { id: eventId },
    data: { templateId: template.id },
  });
  return template.id;
}

async function main() {
  await assertSchemaIsMigrated(pool);
  console.log("Seeding the multi-role scenario…");

  const u = await seedCast();
  const now = Date.now();

  // Venue Foxer: two venues.
  const hall1 = await seedVenue(u.multi, 1);
  const hall2 = await seedVenue(u.multi, 2);

  // Gear Foxer, Talent Foxer, Performer Foxer: listings of each.
  const speakers = await seedAsset(u.multi, "PA speakers", 3500);
  const lights = await seedAsset(u.multi, "Stage lights", 2500);
  const photo = await seedService(
    u.multi,
    "Event photography",
    "photography",
    8000,
  );
  const video = await seedService(
    u.multi,
    "Highlight video",
    "videography",
    12000,
  );
  const dj = await seedService(u.multi, "Club DJ set", "dj", 9000);
  const band = await seedService(u.multi, "Live band", "live_band", 18000);

  // Event Foxer: Mika's own events. One is happening now, one is coming up.
  const liveId = await upsertEvent(u.multi, u.multi, {
    name: "Harbour Night",
    startAt: new Date(now - HOUR),
    endAt: new Date(now + 4 * HOUR),
    eventStatus: "ongoing",
    requestStatus: "approved",
    acceptsOrganizerRequests: true,
  });
  const upcomingId = await upsertEvent(u.multi, u.multi, {
    name: "Sunset Market",
    startAt: new Date(now + 12 * DAY),
    endAt: new Date(now + 12 * DAY + 6 * HOUR),
    eventStatus: "pending",
    requestStatus: "approved",
  });
  // An event Cora asks Mika's venue, gear and services to supply: the
  // requests waiting for an answer.
  const requestEventId = await upsertEvent(u.client, u.client, {
    name: "Garden Wedding",
    startAt: new Date(now + 25 * DAY),
    endAt: new Date(now + 25 * DAY + 6 * HOUR),
    eventStatus: "pending",
    requestStatus: "approved",
  });
  // An event Hugo owns, which he invites Mika to organize.
  const hugoEventId = await upsertEvent(u.host, u.host, {
    name: "Hugo's Reunion",
    startAt: new Date(now + 20 * DAY),
    endAt: new Date(now + 20 * DAY + 5 * HOUR),
    eventStatus: "pending",
    requestStatus: "approved",
    acceptsOrganizerRequests: true,
  });
  const eventIds = [liveId, upcomingId, requestEventId, hugoEventId];

  // Hugo's Reunion is looking for a DJ and some gear: open slots, with no
  // listing in them yet, for a Talent, Performer or Gear Foxer to bid on.
  await seedHugoSlots(u.host, hugoEventId);

  // Reset this scenario's own state, then lay it down again.
  await prisma.appointment.deleteMany({
    where: {
      OR: [{ eventId: { in: eventIds } }, { venueId: { in: [hall1, hall2] } }],
    },
  });
  await prisma.venueEventFoxerAffiliation.deleteMany({
    where: { venueId: { in: [hall1, hall2] } },
  });
  await prisma.eventVenueTransaction.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await prisma.eventAssetTransaction.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await prisma.eventServiceTransaction.deleteMany({
    where: { eventId: { in: eventIds } },
  });
  await prisma.payout.deleteMany({
    where: { providerId: u.multi, sourceId: { startsWith: "multirole-" } },
  });

  // Harbour Night is held at Harbour Hall 1 and already supplied: approved.
  await prisma.eventVenueTransaction.create({
    data: {
      eventId: liveId,
      venueId: hall1,
      providerId: u.multi,
      status: "approved",
      agreedPrice: 20000,
    },
  });
  await prisma.eventServiceTransaction.create({
    data: {
      eventId: liveId,
      serviceId: dj,
      providerId: u.multi,
      status: "approved",
      agreedPrice: 9000,
    },
  });
  await prisma.eventAssetTransaction.create({
    data: {
      eventId: liveId,
      assetId: speakers,
      providerId: u.multi,
      quantity: 2,
      status: "approved",
      agreedPrice: 7000,
    },
  });

  // Waiting for Mika's answer, one for each kind of provider.
  const deadline = new Date(now + 2 * DAY);
  await prisma.eventVenueTransaction.create({
    data: {
      eventId: requestEventId,
      venueId: hall2,
      providerId: u.multi,
      status: "pending_provider_confirmation",
      agreedPrice: 25000,
      confirmationDeadline: deadline,
    },
  });
  await prisma.eventAssetTransaction.create({
    data: {
      eventId: requestEventId,
      assetId: lights,
      providerId: u.multi,
      quantity: 6,
      status: "pending_provider_confirmation",
      agreedPrice: 15000,
      confirmationDeadline: deadline,
    },
  });
  for (const [serviceId, price] of [
    [photo, 8000],
    [video, 12000],
    [band, 18000],
  ] as const) {
    await prisma.eventServiceTransaction.create({
      data: {
        eventId: requestEventId,
        serviceId,
        providerId: u.multi,
        status: "pending_provider_confirmation",
        agreedPrice: price,
        confirmationDeadline: deadline,
      },
    });
  }

  // Payouts over the last eight weeks (the earnings chart wants at least
  // three), with the latest weeks higher than the earlier ones, plus one
  // still pending.
  const weekly = [1800, 2400, 2100, 3200, 2900, 4100, 3600, 5200];
  const sources = [
    "event_venue_transaction",
    "event_service_transaction",
    "event_asset_transaction",
  ] as const;
  for (let i = 0; i < weekly.length; i++) {
    const paidAt = new Date(now - (weekly.length - 1 - i) * WEEK - DAY);
    await prisma.payout.create({
      data: {
        providerId: u.multi,
        sourceType: sources[i % sources.length],
        sourceId: `multirole-paid-${i}`,
        allocationAmount: weekly[i] * 1.1,
        platformFeeAmount: weekly[i] * 0.1,
        payoutAmount: weekly[i],
        status: "paid",
        paidAt,
        createdAt: paidAt,
      },
    });
  }
  await prisma.payout.create({
    data: {
      providerId: u.multi,
      sourceType: "event_venue_transaction",
      sourceId: "multirole-pending-0",
      allocationAmount: 13200,
      platformFeeAmount: 1200,
      payoutAmount: 12000,
      status: "pending",
    },
  });

  // Guests with tickets for Harbour Night, not yet checked in.
  const guests: [CastKey, string][] = [
    ["rosa", "MULTITEST-ROSA"],
    ["gino", "MULTITEST-GINO"],
  ];
  for (const [guest, ticketCode] of guests) {
    const booking = {
      eventId: liveId,
      userId: u[guest],
      guestCount: 2,
      totalAmount: 1500,
      status: "confirmed" as const,
      startAt: new Date(now - HOUR),
      endAt: new Date(now + 4 * HOUR),
      checkedIn: false,
    };
    await prisma.booking.upsert({
      where: { ticketCode },
      update: booking,
      create: { ...booking, ticketCode },
    });
  }

  // Organizer: Mika runs Harbour Hall 1 as its own Organizer, and has an
  // invitation to Hugo's Reunion waiting.
  await prisma.appointment.createMany({
    data: [
      {
        kind: "organizer",
        status: "active",
        venueId: hall1,
        userId: u.multi,
        appointedById: u.multi,
        permissions: [...VENUE_ORGANIZER_PERMISSIONS],
        respondedAt: new Date(),
      },
      {
        kind: "organizer",
        status: "invited",
        eventId: hugoEventId,
        userId: u.multi,
        appointedById: u.host,
        permissions: [...EVENT_ORGANIZER_PERMISSIONS],
        expiresAt: new Date(now + 14 * DAY),
      },
    ],
  });

  console.log(`
✅ Multi-role scenario ready. Every password: ${SEED_PASSWORD}

  multi.multi@${DOMAIN}   Mika: Venue, Event, Gear, Talent and Performer Foxer,
                          and Organizer, in one account
    Venue      two venues; one request from Cora waiting
    Event      Harbour Night is happening now; Sunset Market is coming up
    Gear       two items; one request waiting
    Talent     photography and video; two requests waiting
    Performer  a DJ set and a live band; a request waiting
    Earnings   eight weeks of paid payouts and one pending
    Organizer  runs Harbour Hall 1; invited to Hugo's Reunion
    Bids       Hugo's Reunion has an open DJ slot and an open gear slot

  multi.client@${DOMAIN}  Cora: the client who sent the requests
  multi.host@${DOMAIN}    Hugo: owns Hugo's Reunion and invited Mika
  multi.rosa@${DOMAIN}, multi.gino@${DOMAIN}   Guests: tickets MULTITEST-ROSA,
                          MULTITEST-GINO for Harbour Night
`);
}

main()
  .catch((e) => {
    console.error("Multi-role scenario failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
