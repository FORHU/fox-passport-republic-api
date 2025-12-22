import { prisma } from "../utils/prisma";

export default class UsersRepo {
  // READ ALL
  static async getAllUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        createdAt: true,
      },
    });
  }

  // READ ONE
  static async getUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  // READ BY EMAIL
  static async getUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  // ✅ CREATE (username MUST be required)
  static async createUser(data: {
    email: string;
    username: string; // ✅ REQUIRED
    password: string;
    role?: string;
    name?: string;
  }) {
    return prisma.user.create({
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

  // ✅ UPDATE (fields optional)
  static async updateUser(
    id: string,
    data: Partial<{
      email: string;
      username: string;
      password: string;
      role: string;
      name: string;
      isActive: boolean;
    }>
  ) {
    return prisma.user.update({
      where: { id },
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
      where: { id },
    });
  }
}
