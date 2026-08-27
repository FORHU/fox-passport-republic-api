import { PrismaClient } from "@prisma/client";
import { DATABASE_URL } from "../config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not defined. Check your config or .env file.",
  );
}

// `max` is required: without it the adapter can issue concurrent queries on one
// client, which pg warns about ("client.query() when the client is already
// executing a query") and will hard-error in pg@9.
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
const adapter = new PrismaPg(pool);

/**
 * The password hash is omitted from every query result by default.
 *
 * `GET /users/:id` was a bare `prisma.user.findUnique` returned straight to the
 * client on an unauthenticated route, so it published the hash along with
 * email, phone, address and Stripe ids. The immediate cause was a missing
 * `select`, but the underlying problem is that a bare query returns every
 * scalar and nothing made that unsafe by default — the codebase has many such
 * queries and any of them could surface the hash next.
 *
 * Default-deny instead. The three call sites that genuinely need the hash ask
 * for it explicitly with `omit: { password: false }`:
 *   - login                 (auth.service, verify + legacy re-hash)
 *   - change password       (profile.service)
 *   - delete account        (profile.service)
 *
 * A new query cannot leak it by forgetting a `select`; it can only leak it by
 * deliberately asking, which is reviewable.
 */
const createPrismaClient = () =>
  new PrismaClient({
    adapter,
    omit: { user: { password: true } },
  });

// Derived from the factory rather than written as `PrismaClient`: the omit
// narrows the client's type, and annotating the cache with the wide type would
// discard that narrowing and let an omitted field look present again.
type AppPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const connectToPrisma = async () => {
  try {
    await prisma.$connect();
    console.log("Connected to PostgreSQL via Prisma");
  } catch (error) {
    console.error("Failed to connect to PostgreSQL:", error);
    throw error;
  }
};

export const disconnectPrisma = async () => {
  await prisma.$disconnect();
};
