import bcrypt from "bcryptjs";
import UsersRepo from "../repositories/users.repository";
import { SystemRole } from "@prisma/client";

export default class UsersSvc {
  // GET ALL USERS
  static async getAllUsers() {
    return UsersRepo.getAllUsers();
  }

  // GET USER BY ID
  static async getUserById(id: string) {
    const user = await UsersRepo.findUserById(id);
    if (!user) {
      throw new Error("User not found");
    }
    return user;
  }

  // CREATE USER
  static async createUser(data: {
    email: string;
    username: string;
    password: string;
    name: string;
    role?: SystemRole;
  }) {
    const existingUser = await UsersRepo.getUserByEmail(data.email);
    if (existingUser) throw new Error("Email already exists");

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return UsersRepo.createUser({
      ...data,
      password: hashedPassword,
    });
  }

  // ✅ UPDATE
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
    const user = await UsersRepo.findUserById(id);
    if (!user) throw new Error("User not found");

    return UsersRepo.updateUser(id, data);
  }

  // DELETE
  static async deleteUser(id: string) {
    const user = await UsersRepo.findUserById(id);
    if (!user) throw new Error("User not found");

    return UsersRepo.deleteUser(id);
  }
}

