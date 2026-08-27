import AuthRepo from "../repositories/auth.repository";
import jwt from "jsonwebtoken";
import {
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  rotateRefreshToken,
  RefreshTokenError,
} from "./refresh-token.service";
import { generateOTP, saveOTP, verifyOTP, deleteOTP } from "../utils/otp.utils";
import { sendTemplatedEmail } from "../utils/helpers";
import { hashPassword, verifyPassword, needsRehash } from "../utils/password";

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

    const hashedPassword = await hashPassword(data.password);

    const user = await AuthRepo.createUser({
      email: data.email,
      password: hashedPassword,
      username: data.username,
      name: data.name,
      mobileNumber: data.mobileNumber,
    });

    // Fire-and-forget — badge failure must never block registration
    import("./passport.service")
      .then(({ default: PassportSvc }) =>
        PassportSvc.awardBadgeByName(user.id, "Early Adopter"),
      )
      .catch(() => {});

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
        systemRole: user.systemRole || "user",
        roleType: user.roleType || [],
        email: user.email,
      },
      ACCESS_TOKEN_SECRET,
      {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    );

    // Recorded in the RefreshToken table so this session can be revoked. The
    // claims that used to be embedded here (role, email) were never read on
    // refresh - the user is re-fetched - so the token now carries only what
    // identifies it.
    const refreshToken = await issueRefreshToken(user.id);

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

    return {
      message: "Email verified successfully! You can now login.",
    };
  }

  static async login({ email, password }: { email: string; password: string }) {
    const user = await AuthRepo.findUserByEmail(email);
    if (!user) {
      throw "Invalid credentials";
    }

    // Verify password (accepts both bcrypt and the legacy PBKDF2 format)
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      throw "Invalid credentials";
    }

    // Transparently upgrade legacy/low-cost hashes now that we have the plaintext.
    if (needsRehash(user.password)) {
      try {
        await AuthRepo.updateUser(user.id, {
          password: await hashPassword(password),
        });
      } catch (error) {
        // A failed upgrade must never block a valid login.
        console.error("Failed to upgrade password hash:", error);
      }
    }

    // Update login status
    await AuthRepo.updateUserLoginStatus(user.id);

    // Generate tokens with role
    const accessToken = jwt.sign(
      {
        userId: user.id,
        systemRole: user.systemRole || "user",
        roleType: user.roleType || [],
        email: user.email,
      },
      ACCESS_TOKEN_SECRET,
      {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    );

    // ONE ACTIVE SESSION PER ACCOUNT.
    //
    // Revoke every live refresh token for this user before issuing the new one,
    // so signing in somewhere else ends the previous session rather than running
    // alongside it. One set of credentials cannot be shared across people or
    // devices and stay logged in on all of them.
    //
    // Caveat worth knowing: an access token already issued to the old session
    // stays valid until it expires - it is a stateless JWT and nothing checks a
    // revocation list on every request. With ACCESS_TOKEN_EXPIRY at 15m that is
    // the longest the displaced session can linger, and it cannot renew itself
    // because its refresh token is now revoked.
    await revokeAllForUser(user.id);

    // Recorded in the RefreshToken table so this session can be revoked. The
    // claims that used to be embedded here (role, email) were never read on
    // refresh - the user is re-fetched - so the token now carries only what
    // identifies it.
    const refreshToken = await issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        systemRole: user.systemRole || "user",
        roleType: user.roleType || [],
      },
    };
  }

  /**
   * End a session for real.
   *
   * Revokes the presented refresh token so it cannot mint further access
   * tokens. Already-issued access tokens stay valid until they expire - they
   * are stateless by design and short-lived - but the session cannot be
   * extended past that point.
   *
   * Never throws on a bad token: logout must succeed from the client's point of
   * view regardless, or a user holding a corrupt token can never sign out.
   */
  static async logout(refreshToken?: string) {
    if (!refreshToken) return;
    try {
      const { jti } = await verifyRefreshToken(refreshToken);
      await revokeRefreshToken(jti);
    } catch {
      // Already invalid, revoked or unparseable - nothing left to revoke.
    }
  }

  /**
   * Exchange a refresh token for a new access token *and a new refresh token*.
   *
   * Refresh tokens are single-use. The caller must persist the returned
   * `refreshToken` — keeping the old one means the next refresh fails, because
   * rotating revoked it.
   *
   * Errors are not flattened into one string here. `RefreshTokenError` means
   * "this token is no good" and should be a 401; anything else is
   * infrastructure and must not masquerade as an auth failure. That distinction
   * is the same one that cost real debugging time when a missing table
   * presented as a wrong password.
   */
  static async refreshToken(
    refreshToken: string,
    context?: { userAgent?: string; ip?: string },
  ) {
    // Verifies the signature, checks the jti is still live, revokes it, and
    // issues its successor. Throws RefreshTokenReuseError if a token that was
    // already rotated comes back — at which point every session is revoked.
    const rotated = await rotateRefreshToken(refreshToken, context);

    const user = await AuthRepo.findUserById(rotated.userId);
    if (!user) {
      // The row cascade-deletes with the user, so this is close to unreachable;
      // treat it as a dead token rather than a server fault.
      throw new RefreshTokenError();
    }

    const accessToken = jwt.sign(
      {
        userId: user.id,
        systemRole: user.systemRole || "user",
        roleType: user.roleType || [],
        email: user.email,
      },
      ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
      },
    };
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

    const hashedPassword = await hashPassword(newPassword);

    await AuthRepo.updateUser(user.id, { password: hashedPassword });
    await deleteOTP(email);

    // End every existing session. A password reset is the one action that most
    // often follows "someone else is in my account" - leaving their refresh
    // token alive for the rest of its 7 days would defeat the point of resetting.
    await revokeAllForUser(user.id);

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
