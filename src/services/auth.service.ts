import fs from "fs";
import { ObjectId } from "mongodb";
import path from "path";

import { REFRESH_TOKEN_SECRET, VENUE_4_USE_URI } from "../config";
import { AuthStatus, TUpdateAuth } from "../models/auth.model";
import { hashPassword, MUser, TUser, user_role, user_status } from "../models/user.model";
import AuthRepo from "../repositories/auth.repository";
import UserRepo from "../repositories/user.repository";
import { DevicePayload } from "../types/admin";
import { generateAccessToken, generateRefreshToken, generateVerificationToken, verifyToken } from "../utils/auth";
import { USER_ROLES } from "../utils/constant";
import { handleSendEmail } from "../utils/email.utils";
import { generateOTP } from "../utils/helpers";
import UserSvc from "./user.service";

export default class AuthSvc {
  static async registration(userData: TUser, is_invited?: boolean, device_payload?: DevicePayload) {
    const email = userData.email ?? "";
    const existingUser = await UserRepo.getUser({ email: { $regex: new RegExp(`^${email}$`, "i") } });
    if (existingUser) {
      throw {
        message: "Email already existing",
        error: true,
      };
    }

    const user: any = await UserRepo.createUser(userData);

    const tokenPayload = {
      id: user._id,
      email: user.email,
    };

    if (!is_invited) {
      const verification_link = `${VENUE_4_USE_URI}/verify-email/${generateVerificationToken(tokenPayload)}?role=${userData?.role}`;
      const subject = "Venue4Use: Confirm Your Email Address";
      const filePath = path.join(process.cwd(), `email-template/email-verification.html`);
      const content = fs.readFileSync(filePath, "utf8");
      const html = content.replace("{first_name}", user.first_name).replace("{verification_link}", verification_link);

      handleSendEmail({
        to: user.email,
        subject,
        html,
      });
    }

    const payload = {
      _id: user._id,
      role: user.role,
      username: user.username,
      email: user.email,
      device_id: device_payload.device_id,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await AuthRepo.createToken({
      user: user._id,
      accessToken,
      refreshToken,
      ...(userData.role === USER_ROLES.ADMIN && {
        status: AuthStatus.ACTIVE,
      }),
      ...device_payload,
    });

    return {
      user_id: user._id,
      email: user.email,
      accessToken,
      refreshToken,
    };
  }

  static async sendEmailVerification(userId: string) {
    const query = { _id: new ObjectId(userId), status: "PENDING" };
    const user = await UserRepo.getUser(query);

    if (!user) {
      throw {
        message: "User not found or email already verified",
        error: true,
      };
    }

    const otp_code = generateOTP();

    const payload = {
      otp: {
        otp_code,
        otp_expiration: new Date(Date.now() + 10 * 60 * 1000),
      },

      updatedAt: new Date(),
    };

    const first_name = user?.first_name || "user";

    const subject = "Venue4Use: Confirm Your Email Address";
    const filePath = path.join(process.cwd(), `email-template/email-verification-code.html`);
    const content = fs.readFileSync(filePath, "utf8");
    const html = content.replace("{first_name}", first_name).replace("{otp_code}", otp_code.toString());

    handleSendEmail({
      to: user.email,
      subject,
      html,
    });

    await UserRepo.updateUser(query, payload);
  }

  static async validateOtp(userId: string, otpCode: number) {
    const query = { _id: new ObjectId(userId), status: "PENDING" };
    const { otp } = await UserSvc.getUser(query);

    if (!otp) {
      throw {
        message: "User not found or email already verified",
        error: true,
      };
    }

    if (otpCode !== otp?.otp_code) {
      throw {
        success: false,
        message: "Invalid OTP",
      };
    }

    if (new Date() > new Date(otp?.otp_expiration)) {
      throw {
        success: false,
        message: "OTP has expired",
      };
    }

    return await UserSvc.updateUser(query, {
      status: user_status.ACTIVE,
      otp: null,
    });
  }

  static async login(
    email: string,
    password: string,
    role: string,
    device_payload?: { device_id: string; device: string; operating_system: string; browser: string },
  ) {
    try {
      const user = await UserRepo.getUser({ email: { $regex: new RegExp(`^${email}$`, "i") } });

      const validRoles = {
        [user_role.VENUE_OWNER]: [user_role.VENUE_OWNER, user_role.VENUE_LISTER],
        [user_role.USER]: [user_role.USER],
        [user_role.ADMIN]: [user_role.ADMIN],
      };

      if (!validRoles[role]?.includes(user.role)) {
        throw new Error("1002");
      }

      const UserModel = new MUser(user);
      const isPasswordMatch = await UserModel.comparePassword(password);
      if (!isPasswordMatch) throw new Error("1003");

      const payload = {
        _id: user._id,
        role: user.role,
        username: user.username,
        email: user.email,
        device_id: device_payload.device_id,
      };

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const updateTokenPayload = {
        user: user._id,
        accessToken,
        refreshToken,
        status: AuthStatus.ACTIVE,
        ...device_payload,
      };

      await AuthRepo.updateToken({ device_id: device_payload?.device_id }, updateTokenPayload, { upsert: true });

      return {
        refreshToken,
        accessToken,
        status: user.status,
      };
    } catch (error: any) {
      throw typeof error.message === "string" ? error.message : error;
    }
  }

  static async comparePassword(password: string, user: any) {
    const UserModel = new MUser(user);
    return await UserModel.comparePassword(password);
  }

  static async logout(query: any) {
    await AuthRepo.logoutUser(query);
    return { message: "User logged out successfully" };
  }

  static async verifyGoogleLogin({ email, given_name, family_name, picture }: any) {
    const user: any = await UserRepo.getUser({ email });

    if (!user) {
      const newUser = await this.registerViaGoogle({
        email,
        first_name: given_name,
        last_name: family_name,
        profile_picture: picture,
        origin: "GOOGLE",
        status: user_status.ACTIVE,
      });

      return newUser;
    }

    if (user?.origin === "EMAIL") {
      throw new Error("1004");
    }

    const payload = {
      _id: user._id,
      role: user.role,
      username: user.username,
      email: user.email,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await AuthRepo.updateToken(user._id, {
      accessToken,
      refreshToken,
      status: AuthStatus.ACTIVE,
    });

    return {
      email,
      accessToken,
      refreshToken,
    };
  }

  static async registerViaGoogle({ email, first_name, last_name, profile_picture, origin, status }: any) {
    const user = await UserRepo.createUser({
      email,
      first_name,
      last_name,
      password: "",
      profile_picture,
      origin,
      status,
    });

    const payload = {
      _id: user._id,
      role: user.role,
      username: user.username,
      email: user.email,
    };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await AuthRepo.createToken({
      user: user._id,
      accessToken,
      refreshToken,
      ...(user.role === USER_ROLES.ADMIN && {
        status: AuthStatus.ACTIVE,
      }),
    });

    return {
      ...user,
      accessToken,
      refreshToken,
    };
  }

  static async getAuthUsers(query: any) {
    return AuthRepo.getAuthUsers(query);
  }

  static async changePassword(password: string, userId: ObjectId) {
    try {
      const user = await UserRepo.getUser({ _id: userId });

      if (!user) {
        throw new Error("User not found");
      }
      user.password = password;
      const userModel = new MUser(user);
      const hashedPassword = userModel.hashPassword(password);
      const query = { _id: userId };
      return UserRepo.updateUser(query, { password: hashedPassword });
    } catch (error: any) {
      throw new Error("Error changing password: " + error.message);
    }
  }

  static async refreshToken(refresh_token: string) {
    const token = verifyToken(refresh_token, REFRESH_TOKEN_SECRET);
    if (!token) {
      throw new Error("Invalid token");
    }

    const user: any = await UserRepo.getUser({ _id: new ObjectId(token._id) });
    if (!user) {
      throw new Error("User not found");
    }

    const authToken = await AuthRepo.getAuthUsers({ refreshToken: refresh_token });

    const payload = {
      _id: user._id,
      role: user.role,
      username: user.username,
      email: user.email,
      device_id: authToken?.device_id,
    };

    const accessToken = generateAccessToken(payload);

    await AuthRepo.updateToken(
      { device_id: authToken?.device_id },
      {
        accessToken,
        status: AuthStatus.ACTIVE,
      },
    );

    return {
      accessToken,
    };
  }

  static async verifyEmail(token: string) {
    try {
      const decodedToken = verifyToken(token);
      const userId = new ObjectId(decodedToken.id);
      const userDetails = await UserRepo.getUser({ _id: userId, status: user_status.ACTIVE });

      if (userDetails) {
        throw new Error("EMAIL_ALREADY_VERIFIED");
      }

      return await UserRepo.updateUser({ _id: userId }, { status: user_status.ACTIVE });
    } catch (error) {
      if (error.message === "EMAIL_ALREADY_VERIFIED") {
        throw error;
      }
      throw new Error("Invalid token");
    }
  }

  static async passwordReset(token: string) {
    const decodedToken = await verifyToken(token);
    const user_id = new ObjectId(decodedToken._id);
    const userEmail = decodedToken.email;
    const userFirstName = decodedToken.first_name;
    const result = await UserRepo.passwordReset(user_id);

    const subject = "Venue4Use: Password Reset";
    const filePath = path.join(process.cwd(), `email-template/password-reset.html`);
    const content = fs.readFileSync(filePath, "utf8");
    const html = content.replace("{first_name}", userFirstName);

    handleSendEmail({
      to: userEmail,
      subject,
      html,
    });

    return result;
  }

  static async newPasswordReset(new_password: string, email: string) {
    try {
      const hashedNewPassword = hashPassword(new_password);
      const result = await UserRepo.newPasswordReset(hashedNewPassword, email);
      return result;
    } catch (error) {
      console.error("Error resetting password:", error);
      throw error;
    }
  }

  static async decodeToken(token: string) {
    try {
      return await verifyToken(token);
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  static async accountRecovery(email: string) {
    const user: any = await UserRepo.getUser({ email });

    const userDetail = {
      id: user._id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
    };

    const verification_link = `${VENUE_4_USE_URI}/forgot-password/password-reset/${generateVerificationToken(userDetail)}`;
    const subject = "Venue4Use: Account Recovery";
    const filePath = path.join(process.cwd(), `email-template/account-recovery.html`);
    const content = fs.readFileSync(filePath, "utf8");
    const html = content.replace("{first_name}", user?.first_name).replace("{verification_link}", verification_link);

    handleSendEmail({
      to: email,
      subject,
      html,
    });
  }

  static async updateAuth(userId: ObjectId, updateData: Partial<TUpdateAuth>) {
    return AuthRepo.updateAuth(userId, updateData);
  }

  // static async handleCreateUserRoles(payload) {
  //   try {
  //     const { roles, user_id } = payload;

  //     const userRoles = await UserRolesSvc.createUserRoles({
  //       user: user_id,
  //       roles,
  //     });

  //     return userRoles.insertedId;
  //   } catch (err) {
  //     throw new Error(err.message);
  //   }
  // }
}
