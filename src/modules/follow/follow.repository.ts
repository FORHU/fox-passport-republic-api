import { prisma } from "../../utils/prisma";

export default class FollowRepo {
  static async getUserBasic(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, isPrivate: true },
    });
  }

  static async findRow(followerId: string, followingId: string) {
    return prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
  }

  static async create(
    followerId: string,
    followingId: string,
    status: "pending" | "accepted",
  ) {
    return prisma.follow.create({ data: { followerId, followingId, status } });
  }

  static async delete(followerId: string, followingId: string) {
    return prisma.follow.deleteMany({ where: { followerId, followingId } });
  }

  static async accept(followerId: string, followingId: string) {
    return prisma.follow.updateMany({
      where: { followerId, followingId, status: "pending" },
      data: { status: "accepted" },
    });
  }

  static async checkStatus(followerId: string, followingId: string) {
    const [outgoing, incoming] = await Promise.all([
      prisma.follow.findUnique({
        where: { followerId_followingId: { followerId, followingId } },
      }),
      prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: followingId,
            followingId: followerId,
          },
        },
      }),
    ]);

    if (outgoing) {
      return { status: outgoing.status, direction: "outgoing" as const };
    }
    if (incoming) {
      return { status: incoming.status, direction: "incoming" as const };
    }
    return { status: "none" as const, direction: null };
  }

  static async getRequests(userId: string, page: number, take: number) {
    const [rows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId, status: "pending" },
        include: {
          follower: {
            select: { id: true, name: true, username: true, imgId: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.follow.count({ where: { followingId: userId, status: "pending" } }),
    ]);
    return { rows: rows.map((r) => r.follower), total };
  }

  static async getFollowers(userId: string, page: number, take: number) {
    const [rows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId, status: "accepted" },
        include: {
          follower: {
            select: { id: true, name: true, username: true, imgId: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.follow.count({ where: { followingId: userId, status: "accepted" } }),
    ]);
    return { rows: rows.map((r) => r.follower), total };
  }

  static async getFollowing(userId: string, page: number, take: number) {
    const [rows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId, status: "accepted" },
        include: {
          following: {
            select: { id: true, name: true, username: true, imgId: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.follow.count({ where: { followerId: userId, status: "accepted" } }),
    ]);
    return { rows: rows.map((r) => r.following), total };
  }

  static async getCounts(userId: string) {
    const [followers, following] = await Promise.all([
      prisma.follow.count({ where: { followingId: userId, status: "accepted" } }),
      prisma.follow.count({ where: { followerId: userId, status: "accepted" } }),
    ]);
    return { followers, following };
  }

  static async isAcceptedFollower(followerId: string, followingId: string) {
    const row = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return row?.status === "accepted";
  }

  static async getSuggestions(userId: string) {
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);
    const excludeIds = [...followingIds, userId];

    const suggestions = await prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
      },
      select: {
        id: true,
        name: true,
        username: true,
        imgId: true,
        _count: {
          select: { followers: true },
        },
      },
      orderBy: {
        followers: {
          _count: "desc",
        },
      },
      take: 10,
    });

    return suggestions;
  }
}
