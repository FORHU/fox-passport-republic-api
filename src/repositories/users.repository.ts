import { prisma } from "../utils/prisma";
import { UserRole } from "@prisma/client";

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
      where: { id: String(id) },
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
    role?: UserRole;
    name: string; // ✅ REQUIRED - matches Prisma schema
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
      role: UserRole;
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
