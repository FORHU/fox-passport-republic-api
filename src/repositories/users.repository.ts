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


  // DELETE
  static async deleteUser(id: string) {
    return prisma.user.delete({
      where: { id: String(id) },
    });
  }
}
