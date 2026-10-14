import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Gives published event templates something to buy.
 *
 * An event's price is not a field: it is the sum of the venues, services and
 * assets attached to its template (`EventTemplateVenue` / `Service` / `Asset`,
 * each with an `agreedPrice`). The main seed creates templates without any,
 * so every event browses at 0 and the customize step has nothing to offer.
 *
 * For each published template that has no items yet, this attaches
 *   - one venue (required), preferably in the template's city, at the venue's
 *     own price;
 *   - up to two services, the first required and the second optional;
 *   - one optional asset.
 *
 * Standalone, additive and idempotent: a template that already has any item
 * is left alone, so running it twice changes nothing the second time.
 *
 *   pnpm seed:event-items
 */

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
      "\n❌ Refusing to seed event items: DATABASE_URL must be a local " +
        "database and NODE_ENV development or test.\n" +
        "   If you really mean it: ALLOW_SEED=1 pnpm seed:event-items\n",
    );
    process.exit(1);
  }
}

assertSafeToSeed();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Same city first, then the rest; each list starts at a different place per
 * template so the events do not all share one venue. */
function pick<T extends { city: string | null }>(
  rows: T[],
  city: string | null,
  offset: number,
  count: number,
): T[] {
  if (rows.length === 0) return [];
  const key = norm(city);
  const local = key ? rows.filter((r) => norm(r.city) === key) : [];
  const pool = local.length >= count ? local : [...local, ...rows];
  const unique = [...new Set(pool)];
  const out: T[] = [];
  for (let i = 0; i < unique.length && out.length < count; i++) {
    out.push(unique[(offset + i) % unique.length]);
  }
  return out;
}

async function main() {
  const [templates, venues, services, assets] = await Promise.all([
    prisma.eventTemplate.findMany({
      where: { status: "published" },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        targetCity: true,
        _count: {
          select: {
            templateVenues: true,
            templateServices: true,
            templateAssets: true,
          },
        },
      },
    }),
    prisma.venue.findMany({
      where: { status: "available" },
      orderBy: { id: "asc" },
      select: { id: true, city: true, price: true },
    }),
    prisma.service.findMany({
      where: { status: "available", deletedAt: null },
      orderBy: { id: "asc" },
      select: { id: true, city: true, price: true },
    }),
    prisma.asset.findMany({
      where: { status: "available", deletedAt: null },
      orderBy: { id: "asc" },
      select: { id: true, city: true, price: true },
    }),
  ]);

  console.log(
    `Found ${templates.length} published templates; catalog has ` +
      `${venues.length} venues, ${services.length} services, ${assets.length} assets.`,
  );
  if (venues.length === 0) {
    console.error("No available venues to attach. Run the main seed first.");
    process.exit(1);
  }

  let touched = 0;
  let skipped = 0;
  for (const [index, t] of templates.entries()) {
    const has =
      t._count.templateVenues +
      t._count.templateServices +
      t._count.templateAssets;
    if (has > 0) {
      skipped++;
      continue;
    }

    const [venue] = pick(venues, t.targetCity, index, 1);
    const svc = pick(services, t.targetCity, index, 2);
    const [asset] = pick(assets, t.targetCity, index, 1);

    await prisma.$transaction([
      prisma.eventTemplateVenue.create({
        data: {
          templateId: t.id,
          venueId: venue.id,
          agreedPrice: venue.price,
          isOptional: false,
        },
      }),
      ...svc.map((s, i) =>
        prisma.eventTemplateService.create({
          data: {
            templateId: t.id,
            serviceId: s.id,
            agreedPrice: s.price,
            isOptional: i > 0,
          },
        }),
      ),
      ...(asset
        ? [
            prisma.eventTemplateAsset.create({
              data: {
                templateId: t.id,
                assetId: asset.id,
                quantity: 1,
                agreedPrice: asset.price,
                isOptional: true,
              },
            }),
          ]
        : []),
    ]);
    touched++;
  }

  console.log(
    `Attached items to ${touched} templates; ${skipped} already had items.`,
  );
}

main()
  .catch((e) => {
    console.error("Event items seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
