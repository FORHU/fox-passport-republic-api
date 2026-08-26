import ProfileRepo from "../repositories/profile.repository";
import { revokeAllForUser } from "./refresh-token.service";
import { hashPassword, verifyPassword } from "../utils/password";

export default class ProfileSvc {
  // Get user profile
  static async getProfile(userId: string) {
    const user = await ProfileRepo.findProfileById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  // Update profile
  static async updateProfile(
    userId: string,
    data: {
      name?: string;
      username?: string;
      phone?: string;
      profileImage?: string;
      city?: string;
    },
  ) {
    // Check if username is already taken (if updating username)
    if (data.username) {
      const existingUser = await ProfileRepo.findByUsernameExcludingUserId(
        data.username,
        userId,
      );

      if (existingUser) {
        throw new Error("Username already taken");
      }
    }

    const { profileImage, ...rest } = data;
    return ProfileRepo.updateProfile(userId, {
      ...rest,
      ...(profileImage !== undefined ? { imgId: profileImage } : {}),
    } as Parameters<typeof ProfileRepo.updateProfile>[1]);
  }

  // Change password
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    // Get user with password
    const user = await ProfileRepo.findUserForPasswordCheck(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const isPasswordValid = await verifyPassword(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await ProfileRepo.updatePasswordHash(userId, hashedPassword);

    // A password change must not leave older sessions alive. Note this revokes
    // the caller's own session too - we do not know their jti here, only their
    // userId - so the client is signed out and must log in with the new
    // password. That is the safe default; keeping the current session alive
    // would need the jti threaded through from the request.
    await revokeAllForUser(userId);

    return { message: "Password changed successfully" };
  }

  // Delete account
  static async deleteAccount(userId: string, password: string) {
    // Get user with password
    const user = await ProfileRepo.findUserForPasswordCheck(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      throw new Error("Password is incorrect");
    }

    // Delete user (cascade will handle related records)
    await ProfileRepo.deleteUser(userId);

    return { message: "Account deleted successfully" };
  }
}
