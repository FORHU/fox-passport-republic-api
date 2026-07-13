import AuthRepo from "../repositories/auth.repository";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { generateOTP, saveOTP, verifyOTP, deleteOTP } from "../utils/otp.utils";
import { sendTemplatedEmail } from "../utils/helpers";

import {
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRY,
} from "../config";

export default class AuthSvc {
  static async register(data: {
    email: string;
    password: string;
    username: string;
    name: string;
    mobileNumber?: string;
  }) {
    // Check if user already exists
    const existingUser = await AuthRepo.findUserByEmail(data.email);
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    const existingUsername = await AuthRepo.findUserByUsername(data.username);
    if (existingUsername) {
      throw new Error("Username is already taken");
    }

    // Hash password (same method as login)
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync(data.password, salt, 1000, 64, "sha512")
      .toString("hex");
    const hashedPassword = `${salt}:${hash}`;

    const user = await AuthRepo.createUser({
      email: data.email,
      password: hashedPassword,
      username: data.username,
      name: data.name,
      mobileNumber: data.mobileNumber,
    });

    // Fire-and-forget — badge failure must never block registration
    import("./passport.service").then(({ default: PassportSvc }) =>
      PassportSvc.awardBadgeByName(user.id, "Early Adopter")
    ).catch(() => {});

    const otp = generateOTP();
    try {
      await saveOTP(data.email, otp);
    } catch (error) {
      console.error("OTP save failed, skipping email verification:", error);
    }

    try {
      await sendTemplatedEmail({
        subject: `Verify Your Email Address`,
        email_data: {
          email: user.email,
          OTP_CODE: otp.toString(),
        },
        template_name: "verification-email.html",
      });
    } catch (error) {
      console.error("Failed to send verification email:", error);
      console.log(`[DEV] Verification OTP for ${user.email}: ${otp}`);
    }

    // Generate tokens
    const accessToken = jwt.sign(
      {
        userId: user.id,
        systemRole: (user as any).systemRole || "user",
        roleType: (user as any).roleType || [],
        email: user.email,
      },
      ACCESS_TOKEN_SECRET,
      {
        expiresIn: ACCESS_TOKEN_EXPIRY as any,
      },
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        systemRole: (user as any).systemRole || "user",
        roleType: (user as any).roleType || [],
        email: user.email,
      },
      REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" },
    );

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      accessToken,
      refreshToken,
      message:
        "Registration successful! Please check your email for verification code.",
    };
  }

  static async verifyEmail(email: string, otpCode: string) {
    const user = await AuthRepo.findUserByEmail(email);

    if (!user) {
      throw new Error("User not found");
    }

    const isValid = await verifyOTP(email, otpCode);
    if (!isValid) {
      throw new Error("Invalid or expired verification code");
    }

    await AuthRepo.updateUser(user.id, { isEmailVerified: true });
    await deleteOTP(email);
    await AuthRepo.updateUser(user.id, { isEmailVerified: true });
    await deleteOTP(email);

    return {
      message: "Email verified successfully! You can now login.",
    };
  }

  static async login({ email, password }: { email: string; password: string }) {
    const user = await AuthRepo.findUserByEmail(email);
    if (!user) {
      throw "Invalid credentials";
    }

    // Verify password
    const [salt, storedHash] = user.password.split(":");
    const hash = crypto
      .pbkdf2Sync(password, salt, 1000, 64, "sha512")
      .toString("hex");

    if (storedHash !== hash) {
      throw "Invalid credentials";
    }

    // Update login status
    await AuthRepo.updateUserLoginStatus(user.id);

    // Generate tokens with role
    const accessToken = jwt.sign(
      {
        userId: user.id,
        systemRole: (user as any).systemRole || "user",
        roleType: (user as any).roleType || [],
        email: user.email,
      },
      ACCESS_TOKEN_SECRET,
      {
        expiresIn: ACCESS_TOKEN_EXPIRY as any,
      },
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        systemRole: (user as any).systemRole || "user",
        roleType: (user as any).roleType || [],
        email: user.email,
      },
      REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" },
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        systemRole: (user as any).systemRole || "user",
        roleType: (user as any).roleType || [],
      },
    };
  }

  static async refreshToken(refreshToken: string) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET!,
      ) as { userId: string };

      // Get user
      const user = await AuthRepo.findUserById(String(decoded.userId));
      if (!user) {
        throw "User not found";
      }

      // Generate new access token with role
      const accessToken = jwt.sign(
        {
          userId: user.id,
          systemRole: (user as any).systemRole || "user",
          roleType: (user as any).roleType || [],
          email: user.email,
        },
        ACCESS_TOKEN_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY as any },
      );

      return {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
        },
      };
    } catch (error) {
      throw "Invalid refresh token";
    }
  }

  // Send OTP to reset password
  static async forgotPassword(email: string) {
    // Find user by email
    const user = await AuthRepo.findUserByEmail(email);

    if (!user) {
      // security
      return {
        message:
          "If an account exists with this email, you will receive a password reset code.",
      };
    }

    const otp = generateOTP();
    // Let Redis failure propagate — returning success when OTP was never saved
    // would show a toast to the user but the reset code would never work.
    await saveOTP(email, otp);

    try {
      await sendTemplatedEmail({
        subject: "Password Reset Code",
        email_data: {
          email: user.email,
          OTP_CODE: otp.toString(),
        },
        template_name: "forgot-password.html",
      });
    } catch (error) {
      console.error("Failed to send password reset email:", error);
      console.log(`[DEV] Password reset OTP for ${user.email}: ${otp}`);
    }

    return {
      message:
        "If an account exists with this email, you will receive a password reset code.",
    };
  }

  // Verify OTP and change password
  static async resetPassword(
    email: string,
    otpCode: string,
    newPassword: string,
  ) {
    // Find user by email
    const user = await AuthRepo.findUserByEmail(email);

    if (!user) {
      throw new Error("Invalid request");
    }

    const isValid = await verifyOTP(email, otpCode);
    if (!isValid) {
      throw new Error("Invalid or expired reset code");
    }

    // Hash new password (same method as registration)
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync(newPassword, salt, 1000, 64, "sha512")
      .toString("hex");
    const hashedPassword = `${salt}:${hash}`;

    await AuthRepo.updateUser(user.id, { password: hashedPassword });
    await deleteOTP(email);
    await AuthRepo.updateUser(user.id, { password: hashedPassword });
    await deleteOTP(email);

    return {
      message:
        "Password reset successfully! You can now login with your new password.",
    };
  }

  static async resendVerificationOTP(email: string) {
    const user = await AuthRepo.findUserByEmail(email);

    if (!user) {
      throw new Error("User not found");
    }

    const otp = generateOTP();
    try {
      await saveOTP(email, otp);
    } catch (error) {
      console.error("OTP save failed:", error);
      throw new Error(
        "Verification service temporarily unavailable. Please try again.",
      );
    }

    try {
      await sendTemplatedEmail({
        subject: "Verify Your Email Address",
        email_data: {
          email: user.email,
          OTP_CODE: otp.toString(),
        },
        template_name: "verification-email.html",
      });
    } catch (error) {
      console.error("Failed to resend verification email:", error);
      console.log(`[DEV] Resend OTP for ${user.email}: ${otp}`);
    }
    return {
      message: "New verification code sent to your email",
    };
  }

  static async getAuthUser(userId: string) {
    return AuthRepo.getAuthUser(String(userId));
  }
}
