import { prisma } from "../../utils/prisma";
import { UserPath, RoleType } from "@prisma/client";

export class LeaderboardRepo {
  /**
   * Retrieves all-time top citizens ordered by progression level and total XP.
   */
  static async getCitizenAllTime(city?: string, limit = 50) {
    const paths = await prisma.passportPath.findMany({
      where: {
        path: UserPath.user,
        ...(city
          ? {
              passport: {
                user: {
                  city: { equals: city, mode: "insensitive" },
                },
              },
            }
          : {}),
      },
      include: {
        passport: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                city: true,
              },
            },
          },
        },
      },
      orderBy: [{ level: "desc" }, { totalXP: "desc" }],
      take: limit,
    });

    return paths
      .filter((p) => p.passport?.user)
      .map((p) => ({
        userId: p.passport.user.id,
        name: p.passport.user.name,
        avatarUrl: p.passport.user.image,
        city: p.passport.user.city,
        level: p.level,
        totalXP: p.totalXP,
      }));
  }

  /**
   * Retrieves seasonal citizen XP rankings since the given date (e.g. 1st of month).
   */
  static async getCitizenSeasonal(since: Date, city?: string, limit = 50) {
    // 1. Group seasonal XP from immutable reward events
    const seasonalGroups = await prisma.rewardEvent.groupBy({
      by: ["userId"],
      where: {
        path: UserPath.user,
        createdAt: { gte: since },
        xp: { gt: 0 },
        ...(city
          ? {
              user: {
                city: { equals: city, mode: "insensitive" },
              },
            }
          : {}),
      },
      _sum: { xp: true },
      orderBy: {
        _sum: { xp: "desc" },
      },
      take: limit,
    });

    if (seasonalGroups.length === 0) {
      // Fallback to all-time if month has just begun with 0 events
      return this.getCitizenAllTime(city, limit);
    }

    const userIds = seasonalGroups.map((g) => g.userId);
    const [users, paths] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, image: true, city: true },
      }),
      prisma.passportPath.findMany({
        where: {
          passport: { userId: { in: userIds } },
          path: UserPath.user,
        },
        select: {
          level: true,
          passport: { select: { userId: true } },
        },
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const levelMap = new Map(paths.map((p) => [p.passport.userId, p.level]));

    return seasonalGroups
      .map((g) => {
        const u = userMap.get(g.userId);
        if (!u) return null;
        return {
          userId: u.id,
          name: u.name,
          avatarUrl: u.image,
          city: u.city,
          level: levelMap.get(u.id) ?? 1,
          seasonalXP: g._sum.xp ?? 0,
        };
      })
      .filter(Boolean) as {
      userId: string;
      name: string;
      avatarUrl: string | null;
      city: string | null;
      level: number;
      seasonalXP: number;
    }[];
  }

  /**
   * Retrieves user's own citizen standing.
   */
  static async getUserCitizenStanding(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        image: true,
        city: true,
      },
    });

    if (!user) return null;

    const path = await prisma.passportPath.findFirst({
      where: {
        passport: { userId },
        path: UserPath.user,
      },
      select: { level: true, totalXP: true },
    });

    return {
      userId: user.id,
      name: user.name,
      avatarUrl: user.image,
      city: user.city,
      level: path?.level ?? 1,
      totalXP: path?.totalXP ?? 0,
    };
  }

  /**
   * Retrieves active Foxers filtered by role and city.
   */
  static async getFoxersForRanking(role?: string, city?: string) {
    const whereRole: RoleType[] = role
      ? [role as RoleType]
      : [
          RoleType.providerFoxer,
          RoleType.venueFoxer,
          RoleType.eventFoxer,
          RoleType.performerFoxer,
          RoleType.gearFoxer,
          RoleType.serviceFoxer,
        ];

    const users = await prisma.user.findMany({
      where: {
        roleType: { hasSome: whereRole },
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
      },
      select: {
        id: true,
        name: true,
        image: true,
        city: true,
        roleType: true,
        createdAt: true,
        passport: {
          include: {
            paths: true,
          },
        },
      },
    });

    return users;
  }
}

export default LeaderboardRepo;
