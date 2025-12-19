import UsersRepo from "../repositories/users.repository";
import bcrypt from "bcrypt";

export default class UsersSvc {
  // Get all users
  static async getAllUsers() {
    return UsersRepo.getAllUsers();
  }

  // Get a single user by ID
  static async getUserById(id: string) {
    const user = await UsersRepo.getUserById(id);
    if (!user) throw new Error("User not found");
    return user;
  }

  // Get user by email
  static async getUserByEmail(email: string) {
    return UsersRepo.getUserByEmail(email);
  }

  // Create a new user
  static async createUser(data: { email: string; username: string; password: string; name?: string; role?: string }) {
    const existingUser = await UsersRepo.getUserByEmail(data.email);
    if (existingUser) throw new Error("Email already exists");

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return UsersRepo.createUser({ ...data, password: hashedPassword });
  }

  // Update user
  static async updateUser(
    id: string,
    data: Partial<{ email: string; username: string; password: string; role?: string; name?: string }>
  ) {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    return UsersRepo.updateUser(id, data);
  }

  // Delete user
  static async deleteUser(id: string) {
    return UsersRepo.deleteUser(id);
  }
}
