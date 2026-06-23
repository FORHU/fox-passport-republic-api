import { PrismaClient } from "@prisma/client";
import { DATABASE_URL } from "../src/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined. Check your config or .env file.");
}

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;