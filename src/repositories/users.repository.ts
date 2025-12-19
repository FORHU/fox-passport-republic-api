import { prisma } from "../utils/prisma";

export default class UsersRepo {
  // 1️⃣ Get all users
  static async getAllUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
      },
    });
  }

  // 2️⃣ Get a single user by ID
  static async getUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  // 3️⃣ Get a single user by email
  static async getUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  // 4️⃣ Create a new user
  static async createUser(data: { email: string; username?: string; password: string; role?: string }) {
  }

  // 5️⃣ Update a user
  static async updateUser(
    id: string,
    data: Partial<{ email: string; username: string; password: string; role: string; isActive: boolean }>
  ) {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  // 6️⃣ Delete a user
  static async deleteUser(id: string) {
    return prisma.user.delete({
      where: { id },
    });
  }
}
