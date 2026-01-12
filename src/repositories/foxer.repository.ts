import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export default class FoxerRepo {
  // CREATE OR UPDATE PROFLIE
  static async upsertFoxerProfile(userId: string, data: any) {
    return prisma.foxerProfile.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }

  // GET BY USER ID
  static async getFoxerByUserId(userId: string) {
    return prisma.foxerProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImage: true,
          },
        },
      },
    });
  }

  // GET BY ID
  static async getFoxerById(id: string) {
    return prisma.foxerProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImage: true,
          },
        },
      },
    });
  }

  // LIST ALL AVAILABLE FOXERS
  static async getAllAvailableFoxers() {
    return prisma.foxerProfile.findMany({
      where: { isAvailable: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }
}
