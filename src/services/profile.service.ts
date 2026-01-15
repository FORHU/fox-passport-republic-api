import { prisma } from "../utils/prisma";
import bcrypt from "bcryptjs";

export default class ProfileSvc {
    // Get user profile
    static async getProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
                name: true,
                phone: true,
                profileImage: true,
                role: true,
                isHost: true,
                isFoxer: true,
                isVerified: true,
                createdAt: true,
                updatedAt: true
            }
        });

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
            const existingUser = await prisma.user.findFirst({
                where: {
                    username: data.username,
                    NOT: { id: userId }
                }
            });

            if (existingUser) {
                throw new Error("Username already taken");
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data,
            select: {
                id: true,
                email: true,
                username: true,
                name: true,
                phone: true,
                profileImage: true,
                role: true,
                isHost: true,
                isFoxer: true,
                isVerified: true,
                updatedAt: true
            }
        });

        return updatedUser;
    }

    // Change password
    static async changePassword(
        userId: string,
        currentPassword: string,
        newPassword: string
    ) {
        // Get user with password
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

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
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        return { message: "Password changed successfully" };
    }

    // Delete account
    static async deleteAccount(userId: string, password: string) {
        // Get user with password
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            throw new Error("User not found");
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error("Password is incorrect");
        }

        // Delete user (cascade will handle related records)
        await prisma.user.delete({
            where: { id: userId }
        });

        return { message: "Account deleted successfully" };
    }
}
