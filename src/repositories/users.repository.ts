import { prisma } from "../utils/prisma";
import { SystemRole, RoleType } from "@prisma/client";

export default class UsersRepo {
  // READ ALL (optionally filtered by roleType)
  static async getAllUsers(roleTypes?: RoleType[]) {
    return prisma.user.findMany({
      where: roleTypes && roleTypes.length > 0
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

  // READ FOXERS — public listing for the landing page
  static async findFoxers(limit = 9, page = 1, roleType?: RoleType) {
    const skip = (page - 1) * limit;
    const allFoxerRoles: RoleType[] = ["foxerService", "foxerAsset", "host"];
    return prisma.user.findMany({
      where: {
        roleType: roleType
          ? { has: roleType }
          : { hasSome: allFoxerRoles },
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
    });
  }


  // READ SINGLE FOXER with services + event templates (public profile)
  static async findFoxerById(id: string) {
    return prisma.user.findFirst({
      where: { id, roleType: { hasSome: ["foxerService", "foxerAsset", "host"] as RoleType[] } },
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
    }>
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
    const user = await prisma.user.findUnique({ where: { id }, select: { roleType: true } });
    if (!user) throw new Error("User not found");
    if (user.roleType.includes(roleType)) return prisma.user.findUnique({ where: { id } });
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
    const [serviceAgg, assetAgg, userItems] = await Promise.all([
      prisma.serviceBooking.aggregate({
        where: { service: { ownerId: userId }, status: { in: ["confirmed", "active", "completed"] } },
        _count: { id: true },
        _sum: { totalAmount: true },
      }),
      prisma.assetBooking.aggregate({
        where: { asset: { ownerId: userId }, status: { in: ["confirmed", "active", "completed"] } },
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

    const reviewAgg = entityIds.length > 0
      ? await prisma.review.aggregate({
          where: { entityId: { in: entityIds } },
          _avg: { rating: true },
        })
      : { _avg: { rating: null } };

    return {
      totalBookings: (serviceAgg._count.id ?? 0) + (assetAgg._count.id ?? 0),
      totalRevenue: (serviceAgg._sum.totalAmount ?? 0) + (assetAgg._sum.totalAmount ?? 0),
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
