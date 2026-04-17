import { prisma } from "../utils/prisma";

export default class ProfileRepo {
  static async findProfileById(userId: string) {
    return prisma.user.findUnique({
      where: { id: String(userId) },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        phone: true,
        imgId: true,
        role: true,
        isHost: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  static async findUserForPasswordCheck(userId: string) {
    return prisma.user.findUnique({
      where: { id: String(userId) },
      select: {
        id: true,
        password: true,
      },
    });
  }

  static async findByUsernameExcludingUserId(username: string, excludeUserId: string) {
    return prisma.user.findFirst({
      where: {
        username,
        NOT: { id: String(excludeUserId) },
      },
      select: { id: true },
    });
  }

  static async updateProfile(
    userId: string,
    data: {
      name?: string;
      username?: string;
      phone?: string;
      imgId?: string;
    }
  ) {
    return prisma.user.update({
      where: { id: String(userId) },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        phone: true,
        imgId: true,
        role: true,
        isHost: true,
        isVerified: true,
        updatedAt: true,
      },
    });
  }

  static async updatePasswordHash(userId: string, passwordHash: string) {
    return prisma.user.update({
      where: { id: String(userId) },
      data: { password: passwordHash },
      select: { id: true },
    });
  }

  static async deleteUser(userId: string) {
    return prisma.user.delete({
      where: { id: String(userId) },
      select: { id: true },
    });
  }
}

