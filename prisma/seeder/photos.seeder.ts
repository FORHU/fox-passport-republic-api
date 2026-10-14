import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Gives venues, event templates, gear and services a photo.
 *
 * Browse screens show a photo per row; the main seed only gives a handful of
 * templates one, so most rows render as an empty tile. For every row that has
 * no image yet this adds one `File` pointing at a stock photo, chosen by the
 * item's category (templates) or rotated deterministically (the rest).
 *
 * Standalone, additive and idempotent: a row that already has an image is
 * skipped, each created file has a fixed id (`seed-photo-<kind>-<row id>`), and
 * nothing is ever updated or deleted. The photos are generic stock images, not
 * pictures of the actual item.
 *
 *   pnpm seed:photos
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
      "\n❌ Refusing to seed photos: DATABASE_URL must be a local " +
        "database and NODE_ENV development or test.\n" +
        "   If you really mean it: ALLOW_SEED=1 pnpm seed:photos\n",
    );
    process.exit(1);
  }
}

assertSafeToSeed();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=800&auto=format&fit=crop`;

/** Stock photos already used by the main seed and the app, so known to load. */
const POOL = [
  "1530103862676-de8c9debad1d",
  "1519167758481-83f550bb49b3",
  "1499916078039-922301b0eb9b",
  "1492684223066-81342ee5ff30",
  "1464366400600-7168b8af9bc3",
  "1511795409834-ef04bbd61622",
  "1505236858219-8359eb29e329",
  "1478147427282-58a87a120781",
  "1470225620780-dba8ba36b745",
  "1465495976277-4387d4b0b4c6",
  "1558618666-fcd25c85cd64",
  "1505373877841-8d25f7d46678",
];

/** Templates: a photo that suits the category, rotating within it. */
const BY_CATEGORY: Record<string, string[]> = {
  wedding: ["1465495976277-4387d4b0b4c6", "1519167758481-83f550bb49b3"],
  birthday: ["1558618666-fcd25c85cd64", "1530103862676-de8c9debad1d"],
  corporate: ["1505373877841-8d25f7d46678", "1511795409834-ef04bbd61622"],
  social: ["1470225620780-dba8ba36b745", "1492684223066-81342ee5ff30"],
};

/** A stable number from an id, so reruns pick the same photo. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const fromPool = (id: string) => POOL[hash(id) % POOL.length];

type Link = "venueId" | "templateId" | "assetId" | "serviceId";

async function addPhotos(
  kind: string,
  link: Link,
  rows: { id: string; name: string; photoId: string }[],
) {
  if (rows.length === 0) return 0;
  const where: Prisma.FileWhereInput = {
    [link]: { in: rows.map((r) => r.id) },
    deletedAt: null,
  };
  const existing = await prisma.file.findMany({
    where,
    select: { venueId: true, templateId: true, assetId: true, serviceId: true },
  });
  const has = new Set(existing.map((f) => f[link]));
  const missing = rows.filter((r) => !has.has(r.id));
  for (const r of missing) {
    await prisma.file.upsert({
      where: { id: `seed-photo-${kind}-${r.id}` },
      update: {},
      create: {
        id: `seed-photo-${kind}-${r.id}`,
        url: photo(r.photoId),
        name: r.name,
        type: "image/jpeg",
        [link]: r.id,
      } as Prisma.FileUncheckedCreateInput,
    });
  }
  console.log(
    `  ${kind}: ${missing.length} added, ${rows.length - missing.length} already had one`,
  );
  return missing.length;
}

async function main() {
  const [venues, templates, assets, services] = await Promise.all([
    prisma.venue.findMany({
      where: { status: "available" },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.eventTemplate.findMany({
      where: { status: "published" },
      select: { id: true, name: true, category: true },
      orderBy: { id: "asc" },
    }),
    prisma.asset.findMany({
      where: { status: "available", deletedAt: null },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
    prisma.service.findMany({
      where: { status: "available", deletedAt: null },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    }),
  ]);

  console.log("Adding photos where none exist:");
  let added = 0;
  added += await addPhotos(
    "venue",
    "venueId",
    venues.map((v) => ({ ...v, photoId: fromPool(v.id) })),
  );
  added += await addPhotos(
    "template",
    "templateId",
    templates.map((t) => {
      const options = BY_CATEGORY[t.category];
      const photoId = options
        ? options[hash(t.id) % options.length]
        : fromPool(t.id);
      return { id: t.id, name: t.name, photoId };
    }),
  );
  added += await addPhotos(
    "asset",
    "assetId",
    assets.map((a) => ({ ...a, photoId: fromPool(a.id) })),
  );
  added += await addPhotos(
    "service",
    "serviceId",
    services.map((s) => ({ ...s, photoId: fromPool(s.id) })),
  );
  console.log(`Done: ${added} photos added.`);
}

main()
  .catch((e) => {
    console.error("Photo seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
