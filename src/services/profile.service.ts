import bcrypt from "bcryptjs";
import ProfileRepo from "../repositories/profile.repository";

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
    static async updateProfile(userId: string, data: {
        name?: string;
        username?: string;
        phone?: string;
        profileImage?: string;
    }) {
        // Check if username is already taken (if updating username)
        if (data.username) {
            const existingUser = await ProfileRepo.findByUsernameExcludingUserId(
                data.username,
                userId
            );

            if (existingUser) {
                throw new Error("Username already taken");
            }
        }

        const { profileImage, ...rest } = data;
        return ProfileRepo.updateProfile(userId, {
            ...rest,
            ...(profileImage !== undefined ? { imgId: profileImage } : {}),
        });
    }

    // Change password
    static async changePassword(
        userId: string,
        currentPassword: string,
        newPassword: string
    ) {
        // Get user with password
        const user = await ProfileRepo.findUserForPasswordCheck(userId);

        if (!user) {
            throw new Error("User not found");
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            throw new Error("Current password is incorrect");
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await ProfileRepo.updatePasswordHash(userId, hashedPassword);

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
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error("Password is incorrect");
        }

        // Delete user (cascade will handle related records)
        await ProfileRepo.deleteUser(userId);

        return { message: "Account deleted successfully" };
    }
}
