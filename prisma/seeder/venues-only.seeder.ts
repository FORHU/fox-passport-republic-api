import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import type { LngLat } from "../../src/utils/geo";
import { getVenueCoords, resolveNonOverlappingBoundary } from "./city-coords";
import {
  BULK_EVENT_VENUES,
  EVENT_VENUES,
  PACKAGE_VENUE_MOVES,
  PACKAGE_VENUES,
  seedEventVenue,
  seedPackageVenue,
} from "./event-venues";
import { SAMPLE_VENUE_IMAGES, SAMPLE_VENUES } from "./sample-venues";

/**
 * Only the venues of the seeded packages, events and stamps (api#500), for a
 * shared database where the whole seed must not run: that one creates accounts.
 * This one never touches a user, and skips what isn't seeded or was changed by
 * hand.
 *
 *   pnpm seed:venues                                     # dry run
 *   SEED_VENUES_APPLY=<database name> pnpm seed:venues   # writes
 *
 * A dry run does the same work in a transaction and rolls it back.
 */
class DryRun extends Error {}

const venueIdOf = (name: string) =>
  `seed-venue-${name.trim().toLowerCase().replace(/\s+/g, "-")}`;

async function counts(db: Prisma.TransactionClient) {
  const seeded = { startsWith: "seed-" };
  const [packages, events, stamps, users] = await Promise.all([
    db.eventTemplate.count({
      where: {
        id: { startsWith: "seed-template-" },
        templateVenues: { none: { venueId: { not: null } } },
      },
    }),
    db.event.count({
      where: {
        id: { startsWith: "seed-event-" },
        venueTransactions: { none: {} },
      },
    }),
    // Raw: before api#482's migration a stamp could have no venue, which the
    // client's types no longer allow.
    db.$queryRaw<[{ n: number }]>`
      SELECT count(*)::int AS n FROM passport_stamps
      WHERE "bookingId" LIKE 'seed-%' AND "venueId" IS NULL`.then(([r]) => r.n),
    db.user.count(),
  ]);
  return { packages, events, stamps, users };
}

async function seedSampleVenues(db: Prisma.TransactionClient) {
  const like = await db.venue.findUnique({
    where: { id: "seed-venue-grand-palace-hall" },
    select: { mayorId: true },
  });
  if (!like) throw new Error("No seeded venues here: run the main seed first.");
  const existing = await db.venue.findMany({
    where: { boundary: { not: Prisma.AnyNull } },
    select: { boundary: true },
  });
  const placed = existing.map((v) => v.boundary as unknown as LngLat[]);
  let made = 0;
  for (const v of SAMPLE_VENUES) {
    const id = venueIdOf(v.name);
    if (await db.venue.count({ where: { id } })) continue;
    const { coords, boundary } = resolveNonOverlappingBoundary(
      getVenueCoords(v.name, v.city),
      placed,
    );
    await db.venue.create({
      data: { id, ...v, ...coords, boundary, mayorId: like.mayorId },
    });
    const { venueName: _name, ...image } = SAMPLE_VENUE_IMAGES.find(
      (i) => i.venueName === v.name,
    )!;
    await db.file.create({ data: { ...image, venueId: id } });
    made += 1;
  }
  return made;
}

async function run(db: Prisma.TransactionClient) {
  const before = await counts(db);
  const venuesMade = await seedSampleVenues(db);

  let moved = 0;
  for (const [id, { from, to }] of Object.entries(PACKAGE_VENUE_MOVES)) {
    const { count } = await db.eventTemplateVenue.updateMany({
      where: { id, venueId: from },
      data: { venueId: to },
    });
    moved += count;
  }

  const templates = await db.eventTemplate.findMany({
    where: { id: { in: Object.keys(PACKAGE_VENUES) } },
    select: { id: true },
  });
  for (const t of templates) {
    await seedPackageVenue(db, t.id, PACKAGE_VENUES[t.id]);
  }

  const events = await db.event.findMany({
    where: { id: { startsWith: "seed-event-" } },
    select: { id: true, targetCity: true },
  });
  const skipped: string[] = [];
  for (const e of events) {
    const bulk = BULK_EVENT_VENUES[e.targetCity ?? ""];
    const line =
      EVENT_VENUES[e.id] ??
      (e.id.startsWith("seed-event-bulk-") && bulk
        ? { venueId: bulk, agreedPrice: 0 }
        : undefined);
    if (line) await seedEventVenue(db, e.id, line);
    else skipped.push(e.id);
  }

  // This stamp named another event than its booking's.
  await db.passportStamp.updateMany({
    where: {
      bookingId: "seed-booking-may-wedding-01",
      eventName: "Garcia-Reyes Wedding Reception",
    },
    data: {
      eventName: "Cruz-Dela Rosa Wedding",
      location: "Tagaytay, Philippines",
    },
  });
  // Raw, as in `counts`: a stamp without a venue predates api#482.
  const stamps = await db.$queryRaw<{ id: string; bookingId: string }[]>`
    SELECT id, "bookingId" FROM passport_stamps
    WHERE "bookingId" LIKE 'seed-%' AND "venueId" IS NULL`;
  for (const s of stamps) {
    const held = await db.eventVenueTransaction.findFirst({
      where: {
        event: { bookings: { some: { id: s.bookingId } } },
        included: true,
        status: "approved",
      },
      orderBy: { createdAt: "asc" },
      select: { venueId: true },
    });
    if (held) {
      await db.passportStamp.update({
        where: { id: s.id },
        data: { venueId: held.venueId },
      });
    }
  }

  const after = await counts(db);
  if (after.users !== before.users) throw new Error("A user count changed.");
  console.table({ "without a venue, before": before, after });
  console.log(
    `${venuesMade} sample venue(s) created, ${moved} package line(s) moved to their own city.`,
  );
  if (skipped.length > 0) {
    console.log(`No venue chosen for, left alone: ${skipped.join(", ")}`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { hostname, pathname } = new URL(url);
  const database = pathname.replace(/^\//, "");
  const asked = process.env.SEED_VENUES_APPLY;
  if (asked && asked !== database) {
    throw new Error(
      `SEED_VENUES_APPLY is "${asked}", but DATABASE_URL is "${database}".`,
    );
  }
  console.log(
    `${asked ? "Applying to" : "Dry run on"} "${database}" at ${hostname}`,
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: url })),
  });
  try {
    await prisma.$transaction(
      async (tx) => {
        await run(tx);
        if (!asked) throw new DryRun();
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
    console.log("Applied.");
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    console.log("Dry run: rolled back, nothing was written.");
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
