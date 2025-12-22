import UsersRepo from "../repositories/users.repository";
import bcrypt from "bcrypt";

export default class UsersSvc {
  // READ ALL
  static async getAllUsers() {
    return UsersRepo.getAllUsers();
  }

  // READ ONE
  static async getUserById(id: string) {
    const user = await UsersRepo.getUserById(id);
    if (!user) throw new Error("User not found");
    return user;
  }

  // CREATE
  static async createUser(data: {
    email: string;
    username: string;
    password: string;
    name?: string;
    role?: string;
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
      role?: string;
      name?: string;
    }>
  ) {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    return UsersRepo.updateUser(id, data);
  }

  // DELETE
  static async deleteUser(id: string) {
    return UsersRepo.deleteUser(id);
  }
}
