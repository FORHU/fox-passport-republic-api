import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export default class FoxxerRepo {
    // CREATE OR UPDATE PROFLIE
    static async upsertFoxxerProfile(userId: string, data: any) {
        return prisma.foxxerProfile.upsert({
            where: { userId },
            update: data,
            create: {
                userId,
                ...data,
            },
        });
    }

    // GET BY USER ID
    static async getFoxxerByUserId(userId: string) {
        return prisma.foxxerProfile.findUnique({
            where: { userId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        profileImage: true,
                    }
                }
            }
        });
    }

    // GET BY ID
    static async getFoxxerById(id: string) {
        return prisma.foxxerProfile.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        profileImage: true,
                    }
                }
            }
        });
    }

    // LIST ALL AVAILABLE FOXXERS
    static async getAllAvailableFoxxers() {
        return prisma.foxxerProfile.findMany({
            where: { isAvailable: true },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
        });
    }
}
