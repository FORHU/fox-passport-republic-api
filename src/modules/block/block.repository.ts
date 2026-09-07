import { prisma } from "../../utils/prisma";

export default class BlockRepo {
  static async findRow(blockerId: string, blockedId: string) {
    return prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
  }

  static async create(blockerId: string, blockedId: string) {
    return prisma.block.create({ data: { blockerId, blockedId } });
  }

  static async delete(blockerId: string, blockedId: string) {
    return prisma.block.deleteMany({ where: { blockerId, blockedId } });
  }

  static async getStatus(userId: string, otherId: string) {
    const [blockedByMe, blockedMe] = await Promise.all([
      prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: otherId } },
      }),
      prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: otherId, blockedId: userId } },
      }),
    ]);
    return { blockedByMe: !!blockedByMe, blockedMe: !!blockedMe };
  }

  static async isBlockedEitherWay(a: string, b: string) {
    const row = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { blockerId: true },
    });
    return !!row;
  }

  static async getBlockedUsers(userId: string, page: number, take: number) {
    const [rows, total] = await Promise.all([
      prisma.block.findMany({
        where: { blockerId: userId },
        include: {
          blocked: {
            select: { id: true, name: true, username: true, imgId: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.block.count({ where: { blockerId: userId } }),
    ]);
    return { rows: rows.map((r) => r.blocked), total };
  }
}
