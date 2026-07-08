import { Request, Response } from "express";
import Joi from "joi";
import ProfileSvc from "../services/profile.service";

export default class ProfileCtrl {
  // Get current user profile
  static async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const profile = await ProfileSvc.getProfile(userId);
      return res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch profile",
      });
    }
  }

  // Update profile
  static async updateProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const schema = Joi.object({
        name: Joi.string().optional(),
        username: Joi.string().optional(),
        phone: Joi.string().optional(),
        profileImage: Joi.string().uri().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      const updatedProfile = await ProfileSvc.updateProfile(userId, value);
      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updatedProfile,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to update profile",
      });
    }
  }

  // Change password
  static async changePassword(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const schema = Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(6).required(),
        confirmPassword: Joi.string()
          .valid(Joi.ref("newPassword"))
          .required()
          .messages({ "any.only": "Passwords do not match" }),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      await ProfileSvc.changePassword(
        userId,
        value.currentPassword,
        value.newPassword,
      );

      return res.status(200).json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to change password",
      });
    }
  }

  // Delete account
  static async deleteAccount(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const schema = Joi.object({
        password: Joi.string().required(),
        confirmation: Joi.string()
          .valid("DELETE")
          .required()
          .messages({ "any.only": "Please type DELETE to confirm" }),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      await ProfileSvc.deleteAccount(userId, value.password);

      return res.status(200).json({
        success: true,
        message: "Account deleted successfully",
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to delete account",
      });
    }
  }
}
