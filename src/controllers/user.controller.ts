import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default class UserController {
  /**
   * Upgrade user to host role
   * Allows authenticated users to become hosts
   */
  static async becomeHost(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // Update user to host role
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          role: "host",
          isHost: true,
        },
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          role: true,
          isHost: true,
        },
      });

      return res.status(200).json({
        success: true,
        message: "You are now a host! Please log in again to refresh your session.",
        data: updatedUser,
      });
    } catch (error: any) {
      console.error("Error upgrading to host:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to upgrade to host",
      });
    }
  }

  /**
   * Get current user profile
   */
  static async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

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
          isFoxxer: true,
          isVerified: true,
          createdAt: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch profile",
      });
    }
  }
}
