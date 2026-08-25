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

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

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
