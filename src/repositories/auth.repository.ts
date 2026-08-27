import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";

export default class AuthRepo {
  static async createUser(data: {
    email: string;
    password: string;
    username: string;
    name: string;
    mobileNumber?: string;
    otpCode?: string;
    otpExpiry?: Date;
  }) {
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        username: data.username,
        name: data.name,
        phone: data.mobileNumber,
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

  /**
   * Loads the user WITH the password hash. The client omits it globally (see
   * utils/prisma.ts), so login has to ask for it explicitly — which is the
   * point: leaking it now takes a deliberate act, not a forgotten `select`.
   */
  static async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: {
        email,
      },
      omit: { password: false },
    });
  }

  static async updateUserLoginStatus(userId: string) {
    return prisma.user.update({
      where: {
        id: String(userId),
      },
      data: {
        updatedAt: new Date(),
      },
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

  static async findUserById(userId: string) {
    return prisma.user.findUnique({
      where: {
        id: String(userId),
      },
    });
  }

  static async findUserByUsername(username: string) {
    return prisma.user.findUnique({
      where: {
        username,
      },
    });
  }

  static async updateUser(
    userId: number | string,
    data: Prisma.UserUpdateInput,
  ) {
    return prisma.user.update({
      where: {
        id: String(userId),
      },
      data: data,
    });
  }

  static async getAuthUser(userId: number | string) {
    return prisma.user.findUnique({
      where: {
        id: String(userId),
      },
      select: {
        id: true,
        name: true,
        username: true,
        systemRole: true,
        roleType: true,
      },
    });
  }
}
