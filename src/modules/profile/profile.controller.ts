import { Request, Response } from "express";
import Joi from "joi";
import ProfileSvc, { USERNAME_TAKEN } from "./profile.service";
import { SUPPORTED_CURRENCIES } from "../fx/fx.service";
import { usernameJoi } from "../../utils/username";
import { passwordJoi } from "../../utils/password-policy";
import { normalizePhone } from "../../utils/phone";
import { nameJoi } from "../../utils/limits";
import { sendServerError } from "../../utils/errors";
import { VALIDATE_ALL, sendValidationError } from "../../utils/validation";

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
        name: nameJoi().optional(),
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
        // A Provider's catalog specialties; replaces the ones stored. Checked by
        // the service (at least one, each in the catalog, none with bookings
        // ahead removed).
        specialties: Joi.array().items(Joi.string()).max(50).optional(),
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
        // An error can name the field it is about (a refused specialty edit).
        ...(typeof (e as { field?: unknown }).field === "string" && {
          field: (e as { field: string }).field,
        }),
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
        newPassword: passwordJoi().required(),
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

  /** GET /v1/profile/commission: the EventFoxer's commission rate (#264 T5). */
  static async getCommission(req: Request, res: Response) {
    try {
      const data = await ProfileSvc.getCommission(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  /**
   * PUT /v1/profile/commission `{ commissionPct }`: one rate, 0–100 in percent
   * with up to 2 decimals (the column is Decimal(5,2)), for every Event the
   * EventFoxer created.
   */
  static async setCommission(req: Request, res: Response) {
    try {
      const { error, value } = COMMISSION_BODY_SCHEMA.validate(
        req.body,
        VALIDATE_ALL,
      );
      if (error) return sendValidationError(res, error);

      const data = await ProfileSvc.setCommission(
        req.user!.userId,
        value.commissionPct,
        { userId: req.user!.userId, email: req.user!.email },
      );
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }
}

const COMMISSION_BODY_SCHEMA = Joi.object({
  commissionPct: Joi.number()
    .min(0)
    .max(100)
    .precision(2)
    .strict()
    .required()
    .messages({
      "number.base": "Enter the commission as a number, like 10 for 10%.",
      "number.min": "The commission can't be below 0%.",
      "number.max": "The commission can't be above 100%.",
      "number.precision": "Use at most 2 decimals, like 12.5.",
    }),
});
