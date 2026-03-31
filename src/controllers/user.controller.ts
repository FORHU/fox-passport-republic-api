import { Request, Response } from "express";
import UsersSvc from "../services/users.service";
import ProfileSvc from "../services/profile.service";

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

      const updatedUser = await UsersSvc.becomeHost(String(userId));

      return res.status(200).json({
        success: true,
        message:
          "Your request to be a mayor has been sent to the admin. Please wait for the admin to approve your request.",
        data: updatedUser,
      });
    } catch (error: any) {
      console.error("Error upgrading to mayor:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to upgrade to mayor",
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

      const user = await ProfileSvc.getProfile(String(userId));

      return res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      if (error.message === "User not found") {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch profile",
      });
    }
  }
}
