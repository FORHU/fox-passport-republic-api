import AuthRepo from "../repositories/auth.repository";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { generateOTP, getOTPExpiry, isOTPExpired } from "../utils/otp.utils";
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

    // GENERATE OTP
    // const otp = generateOTP(); // "582941"
    //const otpExpiry = getOTPExpiry(); // 5 minutes from now

    // Create user with OTP
    const user = await AuthRepo.createUser({
      email: data.email,
      password: hashedPassword,
      username: data.username,
      name: data.name,
      mobileNumber: data.mobileNumber,
      //  otpCode: otp, // Save OTP
      // otpExpiry: otpExpiry, // Save expiry
    });

    // Send verification email with OTP
    // try {
    //     sendTemplatedEmail({
    //         subject: `Verify Your Email Address`,
    //         email_data: {
    //             email: user.email,
    //             OTP_CODE: otp.toString(),
    //         },
    //         template_name: "verification-email.html",
    //     });
    // } catch (error) {
    //     console.error("Failed to send verification email:", error);
    //     // Still log to console as backup
    //     console.log(`Backup - OTP for ${user.email}: ${otp}`);
    // }

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
      }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        systemRole: (user as any).systemRole || "user",
        roleType: (user as any).roleType || [],
        email: user.email,
      },
      REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    // Save refresh token
    // await AuthRepo.createSession({
    //     userId: user.id,
    //     refreshToken,
    //     expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    // });

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

    await AuthRepo.updateUser(user.id, {
      isEmailVerified: true,
      otpCode: null,
      otpExpiry: null,
    });

    return {
      message: "Email verified successfully! You can now login.",
    };
  }

  static async login({
    username,
    password,
  }: {
    username: string;
    password: string;
  }) {
    const user = await AuthRepo.findUserByUsername(username);
    console.log("+++++++++", user);
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
      }
    );

    const refreshToken = jwt.sign(
      {
        userId: user.id,
        systemRole: (user as any).systemRole || "user",
        roleType: (user as any).roleType || [],
        email: user.email,
      },
      REFRESH_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    // Create session with refresh token
    // await AuthRepo.createSession({
    //     userId: user.id,
    //     refreshToken: refreshToken,
    //     expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    // });

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
        process.env.REFRESH_TOKEN_SECRET!
      ) as { userId: string };

      // Find valid session
      // const session = await AuthRepo.findValidSession(refreshToken);
      // if (!session) {
      //     throw "Invalid refresh token";
      // }

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
        { expiresIn: ACCESS_TOKEN_EXPIRY as any }
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

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = getOTPExpiry();

    // Save OTP to user
    await AuthRepo.updateUser(user.id, {
      otpCode: otp,
      otpExpiry: otpExpiry,
    });

    // Send email with OTP
    // Send email with OTP
    try {
      sendTemplatedEmail({
        subject: "Password Reset Code",
        email_data: {
          email: user.email,
          OTP_CODE: otp.toString(),
        },
        template_name: "forgot-password.html",
      });
    } catch (error) {
      console.log(`Password Reset OTP for ${user.email}: ${otp}`);
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
    newPassword: string
  ) {
    // Find user by email
    const user = await AuthRepo.findUserByEmail(email);

    if (!user) {
      throw new Error("Invalid request");
    }

    // Hash new password (same method as registration)
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync(newPassword, salt, 1000, 64, "sha512")
      .toString("hex");
    const hashedPassword = `${salt}:${hash}`;

    // Update password and clear OTP
    await AuthRepo.updateUser(user.id, {
      password: hashedPassword,
      otpCode: null,
      otpExpiry: null,
    });

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
    const otpExpiry = getOTPExpiry();

    await AuthRepo.updateUser(user.id, {
      otpCode: otp,
      otpExpiry: otpExpiry,
    });

    try {
      sendTemplatedEmail({
        subject: "Verify Your Email Address",
        email_data: {
          email: user.email,
          OTP_CODE: otp.toString(),
        },
        template_name: "verification-email.html",
      });
    } catch (error) {
      console.log(`OTP for ${user.email}: ${otp}`);
    }
    return {
      message: "New verification code sent to your email",
    };
  }
  static async getAuthUser(userId: string) {
    return AuthRepo.getAuthUser(String(userId));
  }
}
