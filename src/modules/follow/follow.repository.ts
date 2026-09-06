import { prisma } from "../../utils/prisma";

export default class FollowRepo {
  // Delete-then-conditionally-create inside one transaction, instead of a
  // separate checkStatus read followed by a write: the prior read-then-act
  // left a window where two near-simultaneous toggles (double-click, two
  // tabs) could both read the same "not following" state and both call
  // follow(), reporting `{following: true}` to a caller whose real last
  // action should have toggled it back off. Basing the decision on the
  // delete's own affected-row count keeps the decision atomic with the write.
  static async toggle(followerId: string, followingId: string) {
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.follow.deleteMany({
        where: { followerId, followingId },
      });

      if (deleted.count > 0) {
        return { following: false };
      }

      await tx.follow.create({ data: { followerId, followingId } });
      return { following: true };
    });
  }

  static async checkStatus(followerId: string, followingId: string) {
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });
    return !!follow;
  }

  static async getFollowers(userId: string, page: number, take: number) {
    const [rows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
            select: {
              id: true,
              name: true,
              username: true,
              imgId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.follow.count({ where: { followingId: userId } }),
    ]);
    return { rows: rows.map((r) => r.follower), total };
  }

  static async getFollowing(userId: string, page: number, take: number) {
    const [rows, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          following: {
            select: {
              id: true,
              name: true,
              username: true,
              imgId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * take,
        take,
      }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);
    return { rows: rows.map((r) => r.following), total };
  }

  static async getCounts(userId: string) {
    const [followers, following] = await Promise.all([
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);
    return { followers, following };
  }

  static async getSuggestions(userId: string) {
    // 1. Get IDs of users the current user is already following
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId);

    // 2. Fetch active users not in the following list, excluding self
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
