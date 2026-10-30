import { Request, Response } from "express";
import Joi from "joi";
import ProfileSvc, { USERNAME_TAKEN } from "./profile.service";
import { SUPPORTED_CURRENCIES } from "../fx/fx.service";
import { usernameJoi } from "../../utils/username";
import { normalizePhone } from "../../utils/phone";

// Kept in step with the web's usernameSchema (shared/lib/schema.ts) and
// normalizePhone (shared/lib/phone.ts).

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
        username: usernameJoi().optional(),
        // "" (or null) clears the number. Anything else must be valid for
        // its country and is stored as E.164 (+639171234567); a number with
        // no +code is read as Philippine.
        phone: Joi.string()
          .trim()
          .allow("", null)
          .custom(
            (v, helpers) => normalizePhone(v) ?? helpers.error("phone.invalid"),
          )
          .optional()
          .messages({
            "phone.invalid":
              "Enter a valid phone number with its country code, like +63 917 123 4567.",
          }),
        profileImage: Joi.string().uri().optional(),
        country: Joi.string().allow("").optional(),
        state: Joi.string().allow("").optional(),
        city: Joi.string().allow("").optional(),
        district: Joi.string().allow("").optional(),
        isPrivate: Joi.boolean().optional(),
        bio: Joi.string().trim().max(300).allow("").optional(),
        // Each is checked and turned into a clean address by the service.
        socialLinks: Joi.object({
          instagram: Joi.string().trim().max(300).allow(""),
          facebook: Joi.string().trim().max(300).allow(""),
          tiktok: Joi.string().trim().max(300).allow(""),
          x: Joi.string().trim().max(300).allow(""),
          youtube: Joi.string().trim().max(300).allow(""),
          website: Joi.string().trim().max(300).allow(""),
        }).optional(),
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
