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
 * The Organizer scenario — docs/adr/0005-organizer-role-and-appointments.md.
 *
 * A small, fixed cast and world for testing Organizers, Appointments,
 * Check-in Helpers, the Organizer Passport path and the Shared Inbox by hand.
 * Standalone and additive: it never touches the main seed's data, and running
 * it again resets this scenario to its starting state (appointments, inbox
 * threads, XP, check-ins), so every test run begins the same way.
 *
 *   pnpm seed:organizers
 *
 * Every account's password is SEED_PASSWORD below, like the main seed.
 */

const SEED_PASSWORD = "Password123!";
// example.com, like the main seed: login validates emails with Joi's
// `.email()`, which rejects reserved endings such as `.test` before the
// password is ever checked.
const DOMAIN = "example.com";
// Where the first version of this seeder put the cast. Rows found there are
// renamed in place, so an existing scenario carries over instead of doubling.
const OLD_DOMAIN = "organizers.test";

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
      "\n❌ Refusing to seed the Organizer scenario: DATABASE_URL must be a local " +
        "database and NODE_ENV development or test.\n" +
        "   If you really mean it: ALLOW_SEED=1 pnpm seed:organizers\n",
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
  maria: { name: "Maria Mayor", roleType: ["venueFoxer"] },
  juan: { name: "Juan Owner", roleType: ["eventFoxer"] },
  rico: { name: "Rico Rival", roleType: ["eventFoxer"] },
  ben: { name: "Ben Organizer", roleType: ["organizer"] },
  olive: { name: "Olive Organizer", roleType: ["organizer"] },
  sam: { name: "Sam Applicant", roleType: [] },
  lea: { name: "Lea Helper", roleType: [] },
  rosa: { name: "Rosa Guest", roleType: [] },
  gino: { name: "Gino Guest", roleType: [] },
  tina: { name: "Tina Guest", roleType: [] },
} as const;

type CastKey = keyof typeof CAST;
const emailOf = (key: CastKey) => `org.${key}@${DOMAIN}`;

async function seedCast() {
  const password = await hashPassword(SEED_PASSWORD);
  const ids = {} as Record<CastKey, string>;
  for (const key of Object.keys(CAST) as CastKey[]) {
    const { name, roleType } = CAST[key];
    await prisma.user.updateMany({
      where: { email: `${key}@${OLD_DOMAIN}` },
      data: { email: emailOf(key) },
    });
    const user = await prisma.user.upsert({
      where: { email: emailOf(key) },
      // Reset the role too, so a run after an admin removed Ben's Organizer
      // role puts it back. Verified, because login refuses anyone who isn't.
      update: {
        name,
        roleType: [...roleType],
        password,
        isEmailVerified: true,
      },
      create: {
        email: emailOf(key),
        username: `org_test_${key}`,
        name,
        password,
        roleType: [...roleType],
        isEmailVerified: true,
        city: "Davao City",
        country: "Philippines",
      },
      select: { id: true },
    });
    ids[key] = user.id;
  }
  return ids;
}

async function seedVenue(mayorId: string) {
  // Far from every other seeded venue, so its service area overlaps nothing.
  const boundary = [
    [125.61, 7.07],
    [125.612, 7.07],
    [125.612, 7.072],
    [125.61, 7.072],
    [125.61, 7.07],
  ];
  const data = {
    mayorId,
    category: "indoor",
    name: "Sky Hall (Organizer Test)",
    description: "A rooftop hall for testing Organizers and the Shared Inbox.",
    capacity: 200,
    price: 25000,
    billingRate: "daily" as const,
    address: "1 Test Rooftop, Lanang",
    city: "Davao City",
    country: "Philippines",
    status: "available" as const,
    boundary,
    lat: 7.071,
    lng: 125.611,
    spaceType: ["hall"],
    amenities: ["Wi-Fi", "Sound system"],
    // So an Organizer who isn't on the team (Olive) can ask to join.
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
    clientId,
    organizerId: ownerId,
    description: `${data.name} — seeded by the Organizer scenario.`,
    eventCategory: "social" as const,
    guestCount: 50,
    totalAmount: 30000,
  };
  const existing = await prisma.event.findFirst({
    where: { organizerId: ownerId, name: data.name },
    select: { id: true },
  });
  const event = existing
    ? await prisma.event.update({ where: { id: existing.id }, data: fields })
    : await prisma.event.create({ data: fields });
  return event.id;
}

async function main() {
  await assertSchemaIsMigrated(pool);
  console.log("Seeding the Organizer scenario…");

  const u = await seedCast();
  const venueId = await seedVenue(u.maria);

  // Jazz Night is running right now — started an hour ago, ends in four — so
  // check-in, the venue's event-day window and check-in XP can all be tried
  // straight away.
  const now = Date.now();
  const jazzId = await upsertEvent(u.juan, u.juan, {
    name: "Jazz Night (Organizer Test)",
    startAt: new Date(now - HOUR),
    endAt: new Date(now + 4 * HOUR),
    eventStatus: "ongoing",
    requestStatus: "approved",
    acceptsOrganizerRequests: true,
  });

  // A client's request Juan has not answered yet — for accepting as an
  // Organizer (and seeing that declining stays Juan's).
  const requestId = await upsertEvent(u.juan, u.rosa, {
    name: "Garden Wedding Request (Organizer Test)",
    startAt: new Date(now + 30 * DAY),
    endAt: new Date(now + 30 * DAY + 6 * HOUR),
    eventStatus: "pending",
    requestStatus: "pending",
  });

  // Jazz Night is held at Sky Hall — what lets Sky Hall's staff check its
  // guests in, and what pays Sky Hall's Organizers when it completes.
  const tx = await prisma.eventVenueTransaction.findFirst({
    where: { eventId: jazzId, venueId },
    select: { id: true },
  });
  if (!tx) {
    await prisma.eventVenueTransaction.create({
      data: {
        eventId: jazzId,
        venueId,
        providerId: u.maria,
        status: "approved",
        agreedPrice: 25000,
      },
    });
  }

  // Guests with tickets for Jazz Night, reset to not-yet-checked-in.
  const guests: [CastKey, string][] = [
    ["rosa", "ORGTEST-ROSA"],
    ["gino", "ORGTEST-GINO"],
    ["tina", "ORGTEST-TINA"],
  ];
  for (const [guest, ticketCode] of guests) {
    const booking = {
      eventId: jazzId,
      userId: u[guest],
      guestCount: 1,
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

  // Something for a Mayor's or Event Owner's Organizer search to find.
  const specializations: [CastKey, string[]][] = [
    ["ben", ["wedding", "indoor"]],
    ["olive", ["corporate", "hotel"]],
  ];
  for (const [who, categories] of specializations) {
    await prisma.foxerSpecialization.createMany({
      data: categories.map((category) => ({
        userId: u[who],
        roleType: "organizer" as const,
        category,
        source: "declared",
      })),
      skipDuplicates: true,
    });
  }

  // Reset this scenario's own state, then lay it down again.
  const scope = {
    OR: [{ venueId }, { eventId: { in: [jazzId, requestId] } }],
  };
  await prisma.appointment.deleteMany({ where: scope });
  await prisma.organizerEventXp.deleteMany({
    where: { eventId: { in: [jazzId, requestId] } },
  });
  await prisma.conversation.deleteMany({
    where: { OR: [{ inboxVenueId: venueId }, { inboxEventId: jazzId }] },
  });
  await prisma.venueEventFoxerAffiliation.deleteMany({ where: { venueId } });

  // Ben already runs Sky Hall with Maria, and has an invitation to Jazz Night
  // waiting. Lea checks guests in at Jazz Night's door.
  // The real sets, so the scenario never drifts from what an Appointment
  // made in the app would carry.
  const venueSet = [...VENUE_ORGANIZER_PERMISSIONS];
  const eventSet = [...EVENT_ORGANIZER_PERMISSIONS];
  await prisma.appointment.createMany({
    data: [
      {
        kind: "organizer",
        status: "active",
        venueId,
        userId: u.ben,
        appointedById: u.maria,
        permissions: venueSet,
        respondedAt: new Date(),
      },
      {
        kind: "organizer",
        status: "invited",
        eventId: jazzId,
        userId: u.ben,
        appointedById: u.juan,
        permissions: eventSet,
        expiresAt: new Date(now + 14 * DAY),
      },
      {
        kind: "check_in_helper",
        status: "active",
        eventId: jazzId,
        userId: u.lea,
        appointedById: u.juan,
        permissions: ["booking:check-in"],
        respondedAt: new Date(),
      },
    ],
  });

  // Two applications waiting on Sky Hall: one at its standard price, which Ben
  // may approve; one with a negotiated price, which only Maria may approve.
  await prisma.venueEventFoxerAffiliation.createMany({
    data: [
      {
        venueId,
        eventFoxerId: u.juan,
        initiatedBy: "eventFoxer",
        status: "pending",
      },
      {
        venueId,
        eventFoxerId: u.rico,
        initiatedBy: "eventFoxer",
        status: "pending",
        agreedPrice: 18000,
      },
    ],
  });

  // Rosa has already asked Sky Hall a question, and Maria has answered.
  const thread = await prisma.conversation.create({
    data: {
      inboxVenueId: venueId,
      guestId: u.rosa,
      inboxWith: "guest",
      initiatorId: u.rosa,
      status: "accepted",
      contextType: "venue_inbox",
      contextId: venueId,
      contextLabel: "Sky Hall (Organizer Test)",
      lastMessageAt: new Date(),
    },
  });
  await prisma.message.createMany({
    data: [
      {
        conversationId: thread.id,
        senderId: u.rosa,
        content: "Hi! Is there parking at Sky Hall?",
        createdAt: new Date(now - 10 * 60 * 1000),
      },
      {
        conversationId: thread.id,
        senderId: u.maria,
        content: "Yes — free parking in the basement for guests.",
        createdAt: new Date(now - 5 * 60 * 1000),
      },
    ],
  });

  console.log(`
✅ Organizer scenario ready. Every password: ${SEED_PASSWORD}

  org.maria@${DOMAIN}  Mayor of "Sky Hall (Organizer Test)"
  org.juan@${DOMAIN}   Owner of "Jazz Night (Organizer Test)" — happening now,
                   held at Sky Hall — and of a pending client request
  org.ben@${DOMAIN}    Organizer: on Sky Hall's team; invited to Jazz Night
  org.olive@${DOMAIN}  Organizer on no team: sees Sky Hall and Jazz Night under
                   "Open to Organizers" and can ask to join
  org.lea@${DOMAIN}    Check-in Helper at Jazz Night
  org.sam@${DOMAIN}    Citizen — apply for Organizer; can't be invited as one yet
  org.rico@${DOMAIN}   Event Foxer with a priced application to Sky Hall
  org.rosa@${DOMAIN}   Guest: Jazz Night ticket ORGTEST-ROSA; has an inbox thread
                   with Sky Hall; the client on the pending request
  org.gino@${DOMAIN}, org.tina@${DOMAIN}   Guests: tickets ORGTEST-GINO, ORGTEST-TINA

  Jazz Night's Supplier is Maria (Sky Hall is its venue): Juan, and Ben once he
  accepts, can message her from /creator-dashboard/suppliers/<Jazz Night id>.

  admin@example.com (from the main seed) reviews applications and roles.
`);
}

main()
  .catch((e) => {
    console.error("Organizer scenario failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
