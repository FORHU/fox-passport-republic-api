import UsersRepo from "../repositories/users.repository";
import { RoleType, SystemRole } from "@prisma/client";
import { hashPassword } from "../utils/password";

export default class UsersSvc {
  // GET ALL USERS (optionally filtered by roleType)
  static async getAllUsers(roleTypes?: string[]) {
    return UsersRepo.getAllUsers(roleTypes as RoleType[] | undefined);
  }

  // GET FOXERS (public listing, optionally filtered by roleType, specialization, city)
  static async getFoxers(
    limit = 9,
    page = 1,
    roleType?: string,
    specialization?: string,
    city?: string,
  ) {
    return UsersRepo.findFoxers(
      limit,
      page,
      roleType as RoleType,
      specialization,
      city,
    );
  }

  // GET SINGLE FOXER BY ID (public profile with services)
  static async getFoxerById(id: string) {
    const foxer = await UsersRepo.findFoxerById(id);
    if (!foxer) throw new Error("Foxer not found");
    return foxer;
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

    const hashedPassword = await hashPassword(data.password);

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
    }>,
  ) {
    const user = await UsersRepo.findUserById(id);
    if (!user) throw new Error("User not found");

    return UsersRepo.updateUser(id, data);
  }

  // BECOME HOST — adds "host" to roleType array
  static async becomeHost(userId: string) {
    return UsersRepo.addRoleType(userId, "eventFoxer");
  }

  // FOXER STATS
  static async getFoxerStats(userId: string) {
    const user = await UsersRepo.findUserById(userId);
    if (!user) throw new Error("User not found");
    return UsersRepo.getFoxerStats(userId);
  }

  // DELETE
  static async deleteUser(id: string) {
    const user = await UsersRepo.findUserById(id);
    if (!user) throw new Error("User not found");

    return UsersRepo.deleteUser(id);
  }
}
