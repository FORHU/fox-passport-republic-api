import { prisma } from "../../utils/prisma";

export default class WaitlistRepo {
  static async create(templateId: string, userId: string) {
    return prisma.waitlist.create({
      data: { templateId, userId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        template: { select: { id: true, name: true } },
      },
    });
  }

  static async remove(id: string) {
    return prisma.waitlist.delete({ where: { id } });
  }

  static async findByTemplate(templateId: string) {
    return prisma.waitlist.findMany({
      where: { templateId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  static async findEntry(templateId: string, userId: string) {
    return prisma.waitlist.findUnique({
      where: { templateId_userId: { templateId, userId } },
    });
  }

  static async getPosition(
    templateId: string,
    userId: string,
  ): Promise<number> {
    const entry = await prisma.waitlist.findUnique({
      where: { templateId_userId: { templateId, userId } },
    });
    if (!entry) return -1;

    const count = await prisma.waitlist.count({
      where: {
        templateId,
        createdAt: { lt: entry.createdAt },
      },
    });
    return count + 1;
  }

  static async getFirstInLine(templateId: string) {
    return prisma.waitlist.findFirst({
      where: { templateId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async countByTemplate(templateId: string) {
    return prisma.waitlist.count({ where: { templateId } });
  }
}
