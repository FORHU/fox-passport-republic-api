import ProfileRepo from "./profile.repository";
import { permissionsForUser } from "../../types/permissions";
import { revokeAllSessions } from "../auth/sessions.service";
import { hashPassword, verifyPassword } from "../../utils/password";

export default class ProfileSvc {
  // Get user profile
  static async getProfile(userId: string) {
    const user = await ProfileRepo.findProfileById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Derived on read, never stored. The app holds no grant table, so this is
    // where its server-side guards learn what the person may do - and deriving
    // it here means it cannot go stale against the table the way a column
    // would. The API never reads it back: `can()` re-derives from the role.
    return { ...user, permissions: permissionsForUser(user) };
  }

  // Update profile
  static async updateProfile(
    userId: string,
    data: {
      name?: string;
      username?: string;
      phone?: string;
      profileImage?: string;
      country?: string;
      state?: string;
      city?: string;
      district?: string;
      isPrivate?: boolean;
      preferredCurrency?: string;
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

    const passwordToCheck = user.password;
    if (!passwordToCheck) {
      throw new Error(
        "This account does not have a password set (signed in with a social account).",
      );
    }

    // Verify current password
    const isPasswordValid = await verifyPassword(
      currentPassword,
      passwordToCheck,
    );
    if (!isPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password
    await ProfileRepo.updatePasswordHash(userId, hashedPassword);

    // A password change must not leave older sessions alive. This ends the
    // caller's own session too, so they sign in again with the new password.
    await revokeAllSessions(userId);

    return { message: "Password changed successfully" };
  }

  // Delete account
  static async deleteAccount(userId: string, password: string) {
    // Get user with password
    const user = await ProfileRepo.findUserForPasswordCheck(userId);

    if (!user) {
      throw new Error("User not found");
    }

    const passwordToCheck = user.password;
    if (!passwordToCheck) {
      throw new Error(
        "Social login accounts must contact support to delete their account.",
      );
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, passwordToCheck);
    if (!isPasswordValid) {
      throw new Error("Password is incorrect");
    }

    // Delete user (cascade will handle related records)
    await ProfileRepo.deleteUser(userId);

    return { message: "Account deleted successfully" };
  }
}
