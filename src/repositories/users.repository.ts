import { prisma } from "../utils/prisma";
import { SystemRole, RoleType } from "@prisma/client";

export default class UsersRepo {
  // READ ALL (optionally filtered by roleType)
  static async getAllUsers(roleTypes?: RoleType[]) {
    return prisma.user.findMany({
      where:
        roleTypes && roleTypes.length > 0
          ? { roleType: { hasSome: roleTypes } }
          : undefined,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        imgId: true,
        systemRole: true,
        roleType: true,
        createdAt: true,
      },
    });
  }

  // Compute avgRating + reviewCount for a list of foxers in one DB round-trip
  private static async attachRatings<T extends { id: string; services: { id: string }[]; assets?: { id: string }[]; venues?: { id: string }[] }>(
    foxers: T[],
  ): Promise<(T & { avgRating: number | null; reviewCount: number })[]> {
    const allEntityIds = foxers.flatMap((f) => [
      ...f.services.map((s) => s.id),
      ...(f.assets ?? []).map((a) => a.id),
      ...(f.venues ?? []).map((v) => v.id),
    ]);

    if (allEntityIds.length === 0) {
      return foxers.map((f) => ({ ...f, avgRating: null, reviewCount: 0 }));
    }

    const groups = await prisma.review.groupBy({
      by: ["entityId"],
      where: { entityId: { in: allEntityIds } },
      _avg: { rating: true },
      _count: { id: true },
    });

    const byEntity = new Map(groups.map((g) => [g.entityId, g]));

    return foxers.map((f) => {
      const ids = [
        ...f.services.map((s) => s.id),
        ...(f.assets ?? []).map((a) => a.id),
        ...(f.venues ?? []).map((v) => v.id),
      ];
      const hit = ids.map((id) => byEntity.get(id)).filter(Boolean) as typeof groups;
      const reviewCount = hit.reduce((sum, g) => sum + g._count.id, 0);
      const weightedSum = hit.reduce((sum, g) => sum + (g._avg.rating ?? 0) * g._count.id, 0);
      const avgRating = reviewCount > 0 ? weightedSum / reviewCount : null;
      return { ...f, avgRating, reviewCount };
    });
  }

  // Compute avgRating + reviewCount for a list of foxers in one DB round-trip
  private static async attachRatings<T extends { id: string; services: { id: string }[]; assets?: { id: string }[]; venues?: { id: string }[] }>(
    foxers: T[],
  ): Promise<(T & { avgRating: number | null; reviewCount: number })[]> {
    const allEntityIds = foxers.flatMap((f) => [
      ...f.services.map((s) => s.id),
      ...(f.assets ?? []).map((a) => a.id),
      ...(f.venues ?? []).map((v) => v.id),
    ]);

    if (allEntityIds.length === 0) {
      return foxers.map((f) => ({ ...f, avgRating: null, reviewCount: 0 }));
    }

    const groups = await prisma.review.groupBy({
      by: ["entityId"],
      where: { entityId: { in: allEntityIds } },
      _avg: { rating: true },
      _count: { id: true },
    });

    const byEntity = new Map(groups.map((g) => [g.entityId, g]));

    return foxers.map((f) => {
      const ids = [
        ...f.services.map((s) => s.id),
        ...(f.assets ?? []).map((a) => a.id),
        ...(f.venues ?? []).map((v) => v.id),
      ];
      const hit = ids.map((id) => byEntity.get(id)).filter(Boolean) as typeof groups;
      const reviewCount = hit.reduce((sum, g) => sum + g._count.id, 0);
      const weightedSum = hit.reduce((sum, g) => sum + (g._avg.rating ?? 0) * g._count.id, 0);
      const avgRating = reviewCount > 0 ? weightedSum / reviewCount : null;
      return { ...f, avgRating, reviewCount };
    });
  }

  // Shared where-clause builder for foxer listing + count
  static buildFoxerWhere(roleType?: RoleType, specialization?: string, city?: string) {
    const allFoxerRoles: RoleType[] = [
      "serviceFoxer",
      "gearFoxer",
      "eventFoxer",
      "venueFoxer",
    ];
    const foxers = await {
      roleType: roleType ? { has: roleType } : { hasSome: allFoxerRoles },
      ...(specialization ? {
        foxerSpecializations: { some: { category: specialization, ...(roleType ? { roleType } : {}) } },
      } : {}),
      ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
    };
  }

  // READ FOXERS — public listing for the landing page (with total for pagination)
  static async findFoxers(limit = 9, page = 1, roleType?: RoleType, specialization?: string, city?: string) {
    const skip = (page - 1) * limit;
    const where = this.buildFoxerWhere(roleType, specialization, city);
    const [foxers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          imgId: true,
          city: true,
          state: true,
          roleType: true,
          createdAt: true,
          foxerSpecializations: {
            select: { roleType: true, category: true, source: true },
            orderBy: { source: "asc" },
          },
          services: {
            where: { status: "available", deletedAt: null },
            take: 3,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              category: true,
              price: true,
              billingRate: true,
              tags: true,
              description: true,
              images: { take: 1, select: { url: true } },
            },
          },
          assets: {
          where: { status: "available", deletedAt: null },
          take: 3,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            category: true,
            price: true,
            billingRate: true,
            description: true,
            images: { take: 1, select: { url: true } },
          },
        },
        venues: {
          where: { status: "available" },
          take: 3,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            category: true,
            price: true,
            billingRate: true,
            description: true,
            city: true,
            capacity: true,
            images: { take: 1, select: { url: true } },
          },
        },
        eventTemplates: {
            where: { isPublic: true },
            take: 3,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              category: true,
              description: true,
              images: { take: 1, select: { url: true } },
            },
          },
        },
        take: limit,
        skip,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);
    return { foxers, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
    return UsersRepo.attachRatings(foxers);
  }

  // READ SINGLE FOXER with services + event templates (public profile)
  static async findFoxerById(id: string) {
    const foxer = await prisma.user.findFirst({
      where: {
        id,
        roleType: {
          hasSome: ["serviceFoxer", "gearFoxer", "eventFoxer", "venueFoxer"] as RoleType[],
        },
      },
      select: {
        id: true,
        name: true,
        imgId: true,
        city: true,
        state: true,
        roleType: true,
        createdAt: true,
        services: {
          where: { status: "available", deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            category: true,
            price: true,
            billingRate: true,
            tags: true,
            description: true,
            images: { take: 3, select: { url: true } },
          },
        },
        assets: {
          where: { status: "available", deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            category: true,
            price: true,
            billingRate: true,
            description: true,
            images: { take: 3, select: { url: true } },
          },
        },
        venues: {
          where: { status: "available" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            category: true,
            price: true,
            billingRate: true,
            description: true,
            city: true,
            capacity: true,
            images: { take: 3, select: { url: true } },
          },
        },
        foxerSpecializations: {
          select: { roleType: true, category: true, source: true },
          orderBy: { source: "asc" },
        },
        eventTemplates: {
          where: { isPublic: true },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            targetCity: true,
            targetState: true,
            images: { take: 3, select: { url: true } },
          },
        },
      },
    });
    if (!foxer) return null;
    const [enriched] = await UsersRepo.attachRatings([foxer]);
    return enriched;
  }

  // READ ONE
  static async findUserById(id: string) {
    return prisma.user.findUnique({
      where: { id: String(id) },
    });
  }

  // READ BY EMAIL
  static async getUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  // CREATE (username MUST be required)
  static async createUser(data: {
    email: string;
    username: string;
    password: string;
    role?: SystemRole;
    name: string;
  }) {
    return prisma.user.create({
      data: {
        ...data,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        systemRole: true,
        roleType: true,
        createdAt: true,
      },
    });
  }

  // UPDATE (fields optional)
  static async updateUser(
    id: string,
    data: Partial<{
      email: string;
      username: string;
      password: string;
      systemRole: SystemRole;
      name: string;
      isActive: boolean;
    }>,
  ) {
    return prisma.user.update({
      where: { id: String(id) },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        createdAt: true,
      },
    });
  }

  // ADD ROLE TYPE (e.g. become host)
  static async addRoleType(id: string, roleType: RoleType) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { roleType: true },
    });
    if (!user) throw new Error("User not found");
    if (user.roleType.includes(roleType))
      return prisma.user.findUnique({ where: { id } });
    return prisma.user.update({
      where: { id },
      data: { roleType: { push: roleType } },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        systemRole: true,
        roleType: true,
      },
    });
  }

  // FOXER STATS — bookings + revenue + avg rating for owned services/assets
  static async getFoxerStats(userId: string) {
    const [serviceAgg, assetAgg, eventBookingAgg, userItems] = await Promise.all([
      prisma.serviceBooking.aggregate({
        where: {
          service: { ownerId: userId },
          status: { in: ["confirmed", "active", "completed"] },
        },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      prisma.assetBooking.aggregate({
        where: {
          asset: { ownerId: userId },
          status: { in: ["confirmed", "active", "completed"] },
        },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      prisma.booking.aggregate({
        where: {
          event: { organizerId: userId },
          status: { in: ["confirmed", "completed"] },
        },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          services: { select: { id: true } },
          assets: { select: { id: true } },
        },
      }),
    ]);

    const entityIds = [
      ...(userItems?.services.map((s) => s.id) ?? []),
      ...(userItems?.assets.map((a) => a.id) ?? []),
    ];

    const reviewAgg =
      entityIds.length > 0
        ? await prisma.review.aggregate({
            where: { entityId: { in: entityIds } },
            _avg: { rating: true },
          })
        : { _avg: { rating: null } };

    return {
      totalBookings:
        (serviceAgg._count.id ?? 0) +
        (assetAgg._count.id ?? 0) +
        (eventBookingAgg._count.id ?? 0),
      totalRevenue:
        (serviceAgg._sum.totalAmount ?? 0) +
        (assetAgg._sum.totalAmount ?? 0) +
        (eventBookingAgg._sum.totalAmount ?? 0),
      rating: reviewAgg._avg.rating ?? 5.0,
    };
  }

  // DELETE
  static async deleteUser(id: string) {
    return prisma.user.delete({
      where: { id: String(id) },
    });
  }
}
