import { prisma } from "../../utils/prisma";
import BlockRepo from "../block/block.repository";

const SUGGESTION_SELECT = {
  id: true,
  name: true,
  username: true,
  imgId: true,
  _count: { select: { followers: true } },
} as const;

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
      prisma.follow.count({
        where: { followingId: userId, status: "pending" },
      }),
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
      prisma.follow.count({
        where: { followingId: userId, status: "accepted" },
      }),
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
      prisma.follow.count({
        where: { followerId: userId, status: "accepted" },
      }),
    ]);
    return { rows: rows.map((r) => r.following), total };
  }

  static async getCounts(userId: string) {
    const [followers, following] = await Promise.all([
      prisma.follow.count({
        where: { followingId: userId, status: "accepted" },
      }),
      prisma.follow.count({
        where: { followerId: userId, status: "accepted" },
      }),
    ]);
    return { followers, following };
  }

  static async isAcceptedFollower(followerId: string, followingId: string) {
    const row = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return row?.status === "accepted";
  }

  // Ranks "people followed by people you follow" (mutuals) ahead of the
  // plain "most-followed users" fallback, and never suggests someone blocked
  // in either direction — `sendFollow` already refuses that follow, so
  // surfacing them here was just a dead-end click.
  static async getSuggestions(userId: string, page: number, take: number) {
    const [following, blockedIds] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      }),
      BlockRepo.getBlockedEitherWayIds(userId),
    ]);
    const followingIds = following.map((f) => f.followingId);
    const excludeIds = [...new Set([...followingIds, ...blockedIds, userId])];

    // Candidate pool sized to cover every page up to and including this one,
    // since mutual-boosted results and the fallback are ranked as one list.
    const poolSize = page * take;

    const mutualCounts = followingIds.length
      ? await prisma.follow.groupBy({
          by: ["followingId"],
          where: {
            followerId: { in: followingIds },
            status: "accepted",
            followingId: { notIn: excludeIds },
          },
          _count: { followingId: true },
          orderBy: { _count: { followingId: "desc" } },
          take: poolSize,
        })
      : [];
    const mutualIds = mutualCounts.map((m) => m.followingId);

    const [mutualUsers, fallbackUsers] = await Promise.all([
      mutualIds.length
        ? prisma.user.findMany({
            where: { id: { in: mutualIds } },
            select: SUGGESTION_SELECT,
          })
        : Promise.resolve([]),
      prisma.user.findMany({
        where: { id: { notIn: [...excludeIds, ...mutualIds] } },
        select: SUGGESTION_SELECT,
        orderBy: { followers: { _count: "desc" } },
        take: Math.max(poolSize - mutualIds.length, 0),
      }),
    ]);

    // `findMany({ where: { id: { in } } })` doesn't preserve `mutualIds`
    // order, so re-sort by the mutual-follow count computed above.
    const mutualUsersById = new Map(mutualUsers.map((u) => [u.id, u]));
    const ranked = [
      ...mutualIds.map((id) => mutualUsersById.get(id)).filter(Boolean),
      ...fallbackUsers,
    ] as (typeof fallbackUsers)[number][];

    const start = (page - 1) * take;
    return ranked.slice(start, start + take);
  }
}
