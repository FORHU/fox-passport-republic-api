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
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        createdAt: true,
      },
    });
  }

  static async findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  static async updateUserLoginStatus(userId: number | string) {
    return prisma.user.update({
      where: {
        id: Number(userId),
      },
      data: {
        // lastLoginAt field doesn't exist in schema, removing for now
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
      },
    });
  }

  // static async createSession(data: {
  //   userId: string;
  //   refreshToken: string;
  //   expiresAt: Date;
  // }) {
  //   return prisma.session.create({
  //     data: {
  //       ...data,
  //     },
  //   });
  // }

  // static async findValidSession(refreshToken: string) {
  //   return prisma.session.findFirst({
  //     where: {
  //       refreshToken,
  //       expiresAt: {
  //         gt: new Date(),
  //       },
  //     },
  //     include: {
  //       user: true,
  //     },
  //   });
  // }

  static async findUserById(userId: number | string) {
    return prisma.user.findUnique({
      where: {
        id: Number(userId),
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

  static async updateUser(userId: number | string, data: any) {
    return prisma.user.update({
      where: {
        id: Number(userId),
      },
      data: data,
    });
  }
  static async getAuthUser(userId: number | string) {
    return prisma.user.findUnique({
      where: {
        id: Number(userId),
      },
      select: {
        id: true,
        name: true,
        username: true,
      },
    });
  }
}
