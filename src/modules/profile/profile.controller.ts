import { Request, Response } from "express";
import Joi from "joi";
import ProfileSvc, { USERNAME_TAKEN } from "./profile.service";
import { SUPPORTED_CURRENCIES } from "../fx/fx.service";

// Kept in step with the web's usernameSchema / phoneSchema (shared/lib/schema.ts).
const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;
const PHONE_PATTERN = /^\+?\d{8,15}$/;

export default class ProfileCtrl {
  // Get current user profile
  static async getProfile(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

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
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch profile",
      });
    }
  }

  // Update profile
  static async updateProfile(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const schema = Joi.object({
        name: Joi.string().optional(),
        username: Joi.string()
          .trim()
          .lowercase()
          .pattern(USERNAME_PATTERN)
          .optional()
          .messages({
            "string.pattern.base":
              "Usernames need 3–30 characters and can only use letters, numbers, dots and underscores.",
          }),
        // "" (or null) clears the number. Spaces, dashes and brackets are
        // formatting, so they are stripped before the digit check.
        phone: Joi.string()
          .trim()
          .allow("", null)
          .replace(/[\s()-]/g, "")
          .pattern(PHONE_PATTERN)
          .optional()
          .messages({
            "string.pattern.base":
              "Enter a phone number like +63 917 123 4567 (8–15 digits).",
          }),
        profileImage: Joi.string().uri().optional(),
        country: Joi.string().allow("").optional(),
        state: Joi.string().allow("").optional(),
        city: Joi.string().allow("").optional(),
        district: Joi.string().allow("").optional(),
        isPrivate: Joi.boolean().optional(),
        preferredCurrency: Joi.string()
          .valid(...SUPPORTED_CURRENCIES)
          .optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        // `field` lets the form put the message under the input it is about.
        return res.status(400).json({
          success: false,
          message: error.message,
          field: error.details[0]?.path[0],
        });
      }

      const updatedProfile = await ProfileSvc.updateProfile(userId, value);
      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        data: updatedProfile,
      });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to update profile",
        ...(error.message === USERNAME_TAKEN && { field: "username" }),
      });
    }
  }

  // Change password
  static async changePassword(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

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
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to change password",
      });
    }
  }

  // Delete account
  static async deleteAccount(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

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
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to delete account",
      });
    }
  }
}
