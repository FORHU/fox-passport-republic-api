import { Request, Response } from "express";
import Joi from "joi";
import AuthSvc from "../services/auth.service";

/**
 * The service throws the bare string "Invalid credentials" for a bad email or
 * password. Anything else - a Prisma error, a dropped connection, a bug - is a
 * server fault and must not be reported to the client as an auth failure.
 */
function isCredentialFailure(e: unknown): boolean {
  const message = typeof e === "string" ? e : (e as Error)?.message;
  return message === "Invalid credentials";
}

export default class AuthCtrl {
  static async register(req: Request, res: Response) {
    const { email, password, username, name, mobileNumber } = req.body;

    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
      username: Joi.string().required(),
      name: Joi.string().required(),
      mobileNumber: Joi.string().optional(),
    });

    const { error } = schema.validate({
      email,
      password,
      username,
      name,
      mobileNumber,
    });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const user = await AuthSvc.register({
        email,
        password,
        username,
        name,
        mobileNumber,
      });
      return res
        .status(201)
        .json({ message: "User registered successfully", user });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message || error });
    }
  }

  static async verifyEmail(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        email: Joi.string().email().required(),
        otpCode: Joi.string().length(6).required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const result = await AuthSvc.verifyEmail(value.email, value.otpCode);
      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }

  static async login(req: Request, res: Response) {
    const { email, password } = req.body;

    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
    });

    const { error } = schema.validate({ email, password });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const result = await AuthSvc.login({ email, password });
      return res.json(result);
    } catch (e: unknown) {
      console.error("Login error:", e);

      // Only a genuine credential mismatch is a 401. This used to return 401
      // for *any* throw, so infrastructure failures were indistinguishable from
      // a wrong password - a missing database table once presented as "Invalid
      // credentials" and cost real debugging time.
      if (isCredentialFailure(e)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      return res.status(500).json({
        message: "Login failed. Please try again.",
      });
    }
  }

  static async refreshToken(req: Request, res: Response) {
    const { refreshToken } = req.body;

    const schema = Joi.object({
      refreshToken: Joi.string().required(),
    });

    const { error } = schema.validate({ refreshToken });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const result = await AuthSvc.refreshToken(refreshToken);
      return res.json(result);
    } catch (e: unknown) {
      const error = e as Error;
      console.error("Refresh token error:", error);
      return res.status(401).json({ message: error.message || error });
    }
  }

  static async forgotPassword(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        email: Joi.string().email().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const result = await AuthSvc.forgotPassword(value.email);

      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({
        message: error.message || "Failed to process request",
      });
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        email: Joi.string().email().required(),
        otpCode: Joi.string().length(6).required(),
        newPassword: Joi.string().min(6).required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const result = await AuthSvc.resetPassword(
        value.email,
        value.otpCode,
        value.newPassword,
      );

      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({
        message: error.message || "Failed to reset password",
      });
    }
  }

  static async resendVerificationOTP(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        email: Joi.string().email().required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const result = await AuthSvc.resendVerificationOTP(value.email);
      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      // Revokes the refresh token server-side so the session cannot be
      // extended. Previously this returned 200 without doing anything, which
      // meant a leaked refresh token stayed usable for its full lifetime.
      await AuthSvc.logout(req.body?.refreshToken);

      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to logout",
      });
    }
  }
}
