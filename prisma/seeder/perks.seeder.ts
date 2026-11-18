import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Token perks sample data.
 *
 * Puts a spread of perks on the venues and event packages already in the
 * database, so the Perks tab (Rewards > Perks) has choices to show: venue
 * perks and host perks, some cheap, some out of reach of a small balance, one
 * almost gone, one sold out and one taken down (the last two should not show).
 *
 * Standalone and additive: it only writes `perks` rows whose id starts with
 * `seed-perk-`, and running it again puts those back to how they started. It
 * needs venues and published event packages to exist (`pnpm seed` first).
 *
 *   pnpm seed:perks
 *
 * Optional: give one account what it needs to try them. It is raised to 2000
 * Tokens and given a confirmed, upcoming booking at each of those venues and
 * of each of those event packages, since a perk can only be bought for a
 * booking at its venue or of its event package.
 *
 *   SEED_PERKS_EMAIL=you@example.com pnpm seed:perks
 */

const ID_PREFIX = "seed-perk-";
const TOKENS_PER_PESO = 5;
const TOP_UP_TO = 2000;

// Same rule as the other seeds: this writes to a real database, so only ever
// run it against a local one.
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
      "\n❌ Refusing to seed perks: DATABASE_URL must be a local database " +
        "and NODE_ENV development or test.\n" +
        "   If you really mean it: ALLOW_SEED=1 pnpm seed:perks\n",
    );
    process.exit(1);
  }
}

assertSafeToSeed();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

interface PerkSpec {
  slug: string;
  title: string;
  description: string;
  worthPhp: number;
  quantity: number;
  /** Left on offer. Defaults to the full quantity. */
  remaining?: number;
  active?: boolean;
}

const VENUE_PERKS: PerkSpec[] = [
  {
    slug: "welcome-drink",
    title: "Free welcome drink",
    description: "One drink when you arrive. Show your code to staff.",
    worthPhp: 100,
    quantity: 20,
  },
  {
    slug: "starter",
    title: "Starter on the house",
    description: "A starter or dessert with your meal.",
    worthPhp: 160,
    quantity: 10,
  },
  {
    // Costs more than a small balance, so "Tokens to go" shows.
    slug: "chefs-table",
    title: "Chef's table tasting",
    description: "A tasting plate chosen by the kitchen.",
    worthPhp: 600,
    quantity: 4,
  },
  {
    // Nearly gone, so the stock count shows.
    slug: "dessert",
    title: "Dessert on us",
    description: "One dessert to share.",
    worthPhp: 60,
    quantity: 5,
    remaining: 1,
  },
  {
    // Sold out and switched off: neither should be listed.
    slug: "sold-out",
    title: "Sold out sample",
    description: "Should not appear in the list.",
    worthPhp: 80,
    quantity: 3,
    remaining: 0,
  },
  {
    slug: "taken-down",
    title: "Taken down sample",
    description: "Should not appear in the list.",
    worthPhp: 80,
    quantity: 3,
    active: false,
  },
];

const HOST_PERKS: PerkSpec[] = [
  {
    slug: "plus-one",
    title: "Bring a +1",
    description: "One extra guest at no charge.",
    worthPhp: 300,
    quantity: 5,
  },
  {
    slug: "front-table",
    title: "Front table seating",
    description: "A reserved table near the front.",
    worthPhp: 200,
    quantity: 2,
  },
];

/** The ids written this run, so stale seed rows can be cleared after. */
const written = new Set<string>();

async function upsertPerk(
  spec: PerkSpec,
  owner: {
    userId: string;
    issuerType: "venue" | "host";
    venueId: string | null;
    templateId: string | null;
  },
  scope: string,
) {
  const id = `${ID_PREFIX}${scope}-${spec.slug}`;
  written.add(id);
  const data = {
    issuerType: owner.issuerType,
    issuerUserId: owner.userId,
    venueId: owner.venueId,
    templateId: owner.templateId,
    title: spec.title,
    description: spec.description,
    worthPhp: spec.worthPhp,
    tokenCost: Math.max(1, Math.round(spec.worthPhp * TOKENS_PER_PESO)),
    quantity: spec.quantity,
    remaining: spec.remaining ?? spec.quantity,
    validDays: 30,
    active: spec.active ?? true,
  };
  await prisma.perk.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
  return data;
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/**
 * A confirmed booking, a week or more ahead, for this person at each venue and
 * of each event package, so every seeded perk has a booking it works for. Each
 * is its own Event row, as a real booking is. Rewritten on each run.
 */
async function seedDemoBookings(
  userId: string,
  venues: { id: string; name: string; mayorId: string }[],
  templates: { id: string; name: string; ownerId: string }[],
) {
  const now = Date.now();
  let n = 0;
  const make = async (args: {
    key: string;
    name: string;
    organizerId: string;
    templateId: string | null;
    venueId: string | null;
  }) => {
    n += 1;
    const startAt = new Date(now + (6 + n) * DAY);
    const endAt = new Date(startAt.getTime() + 5 * HOUR);
    const eventId = `${ID_PREFIX}evt-${args.key}`;
    const fields = {
      name: `${args.name} (perk demo)`,
      description: "Sample booking so the seeded perks can be tried.",
      clientId: userId,
      organizerId: args.organizerId,
      templateId: args.templateId,
      eventCategory: "social" as const,
      startAt,
      endAt,
      eventStatus: "pending" as const,
      requestStatus: "approved" as const,
      guestCount: 2,
      totalAmount: 2000,
    };
    await prisma.event.upsert({
      where: { id: eventId },
      create: { id: eventId, ...fields },
      update: fields,
    });
    const ticketCode = `PERKDEMO-${args.key}`.slice(0, 40);
    const booking = await prisma.booking.upsert({
      where: { ticketCode },
      create: {
        eventId,
        userId,
        guestCount: 2,
        totalAmount: 2000,
        status: "confirmed",
        startAt,
        endAt,
        ticketCode,
      },
      update: {
        eventId,
        userId,
        status: "confirmed",
        startAt,
        endAt,
        checkedIn: false,
      },
    });
    if (args.venueId) {
      const txId = `${ID_PREFIX}vtx-${args.key}`;
      const tx = {
        eventId,
        bookingId: booking.id,
        venueId: args.venueId,
        providerId: args.organizerId,
        status: "approved" as const,
        agreedPrice: 2000,
      };
      await prisma.eventVenueTransaction.upsert({
        where: { id: txId },
        create: { id: txId, ...tx },
        update: tx,
      });
    }
    console.log(`   🗓  ${args.name}, ${startAt.toISOString().slice(0, 10)}`);
  };
  for (const v of venues) {
    await make({
      key: `v-${v.id}`,
      name: v.name,
      organizerId: v.mayorId,
      templateId: null,
      venueId: v.id,
    });
  }
  for (const t of templates) {
    await make({
      key: `p-${t.id}`,
      name: t.name,
      organizerId: t.ownerId,
      templateId: t.id,
      venueId: null,
    });
  }
}

async function main() {
  // A missing table is the one thing worth saying plainly.
  const { rows } = await pool.query<{ t: string | null }>(
    "SELECT to_regclass('public.perks') AS t",
  );
  if (!rows[0]?.t) {
    console.error(
      "\n❌ The perks table does not exist in this database.\n" +
        "   Apply the migration 20261118100000_add_token_perks first " +
        "(pnpm exec prisma migrate deploy).\n",
    );
    process.exit(1);
  }

  const venues = await prisma.venue.findMany({
    take: 3,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, mayorId: true },
  });
  const templates = await prisma.eventTemplate.findMany({
    where: { status: "published" },
    take: 3,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, ownerId: true },
  });
  if (venues.length === 0 && templates.length === 0) {
    console.error(
      "\n❌ No venues or published event packages found. " +
        "Run the main seed first: pnpm seed\n",
    );
    process.exit(1);
  }

  let made = 0;
  for (const v of venues) {
    console.log(`\n🏛  ${v.name}`);
    for (const spec of VENUE_PERKS) {
      const d = await upsertPerk(
        spec,
        {
          userId: v.mayorId,
          issuerType: "venue",
          venueId: v.id,
          templateId: null,
        },
        `venue-${v.id}`,
      );
      made += 1;
      const note = !d.active
        ? "taken down"
        : d.remaining === 0
          ? "sold out"
          : `${d.remaining} left`;
      console.log(`   ${d.title}: ${d.tokenCost} Tokens, ${note}`);
    }
  }
  for (const t of templates) {
    console.log(`\n🎟  ${t.name}`);
    for (const spec of HOST_PERKS) {
      const d = await upsertPerk(
        spec,
        {
          userId: t.ownerId,
          issuerType: "host",
          venueId: null,
          templateId: t.id,
        },
        `pkg-${t.id}`,
      );
      made += 1;
      console.log(`   ${d.title}: ${d.tokenCost} Tokens, ${d.remaining} left`);
    }
  }

  // Rows from an earlier run that this run no longer writes (a venue that is no
  // longer in the first three, or an older id scheme). Ones somebody already
  // bought are kept: they hold a person's Tokens and code.
  const cleared = await prisma.perk.deleteMany({
    where: {
      id: { startsWith: ID_PREFIX, notIn: [...written] },
      redemptions: { none: {} },
    },
  });
  if (cleared.count > 0)
    console.log(`
🧹 Removed ${cleared.count} stale seed perk(s).`);

  const email = process.env.SEED_PERKS_EMAIL;
  if (email) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (!user) {
      console.warn(`\n⚠️  No account for ${email}; Tokens not topped up.`);
    } else {
      console.log(`
📅 Bookings for ${email}:`);
      await seedDemoBookings(user.id, venues, templates);
      const raised = await prisma.passport.updateMany({
        where: { userId: user.id, coins: { lt: TOP_UP_TO } },
        data: { coins: TOP_UP_TO },
      });
      console.log(
        raised.count > 0
          ? `\n🪙  ${email} now has ${TOP_UP_TO} Tokens.`
          : `\n🪙  ${email} already has ${TOP_UP_TO} Tokens or more (or no passport).`,
      );
    }
  }

  console.log(
    `\n✅ ${made} perks across ${venues.length} venue(s) and ` +
      `${templates.length} event package(s).\n` +
      "   Open Rewards > Perks. A perk works only for a confirmed, upcoming " +
      "booking at its venue or of its package: pass SEED_PERKS_EMAIL=<account " +
      "email> to give that account one of each.\n",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
