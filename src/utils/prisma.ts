import { PrismaClient } from "@prisma/client";
import { DATABASE_URL } from "../config";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        datasources: {
            db: {
                url: DATABASE_URL,
            },
        },
    });

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