import fs from "fs";
import { ObjectId } from "mongodb";
import path from "path";

import { VENUE_4_USE_URI } from "../../config";
import { AuthStatus } from "../../models/auth.model";
import { OrgRoles, StatusType } from "../../models/organization-member.model";
import { TUser, user_role, user_status } from "../../models/user.model";
import { MUserRoles } from "../../models/user-roles.model";
import AuthRepo from "../../repositories/auth.repository";
import UserRepo from "../../repositories/user.repository";
import UserRolesRepo from "../../repositories/user-roles.repository";
import { DevicePayload } from "../../types/admin";
import { generateAccessToken, generateRefreshToken, generateVerificationToken } from "../../utils/auth";
import { USER_ROLES } from "../../utils/constant";
import { handleSendEmail } from "../../utils/email.utils";
import { getRoleDisplayName } from "../../utils/venue/helper";
import CountrySettingSvc from "../country-setting.service";
import OrganizationSvc from "../organization.service";
import OrganizationMemberSvc from "../organization-member.service";
import UserRolesSvc from "../user-roles.service";
import VenueSvc from "../venue.service";
import UserSvc from "../user.service";
import { validateRoleSchema } from "../../utils/auth/validation";

export default class AuthSvc {
  static async registration(payload: any, device_payload?: DevicePayload) {
    const { email, role } = payload;
    const existingUser = await UserRepo.getUser({ email: { $regex: new RegExp(`^${email}$`, "i") } });

    if (existingUser) {
      return await this.handleRegistrationExistingUser({ user: existingUser, role, device_payload }, payload);
    }

    return await this.handleRegistration(payload, device_payload);
  }

  static async handleRegistration(payload: any, device_payload: DevicePayload) {
    const { email, password, role, phone_number, date_of_birth, first_name, last_name, company_name, venue_name, postal, country, social_link } =
      payload;

    const userId = new ObjectId();
    const organizationId = new ObjectId();
    const userRoleId = new ObjectId();

    const userPayload = {
      _id: userId,
      email,
      password,
      role,
      phone_number,
      date_of_birth,
      first_name,
      last_name,
      company_name,
      postal,
      country,
      social_link,
      ...(role === USER_ROLES.VENUE_OWNER && {
        organization: organizationId,
      }),
      ...(role === USER_ROLES.ADMIN && {
        organization: organizationId,
      }),
      ...(role === USER_ROLES.ADMIN && {
        status: user_status.ACTIVE,
      }),
      user_roles: [userRoleId],
    };

    const [user]: any = await Promise.allSettled([
      UserRepo.createUser(userPayload),
      UserRolesSvc.createUserRoles({ _id: userRoleId, user: userId, role, password }),
    ]);

    if (role === user_role.VENUE_OWNER) {
      await this.setupVenueOwner({ venue_name, country, userId, organizationId, company_name });
    }

    return this.handleSendEmailVerification({ user: user.value, role, device_payload }, false);
  }

  static async handleRegistrationExistingUser(
    payload: { user: Partial<TUser>; role: user_role; device_payload: DevicePayload },
    registration_data: any,
  ) {
    const { user, role, device_payload } = payload;
    const userRoleId = new ObjectId();

    const existingUserRole = await UserRolesSvc.getUserRoles({ user: user._id, role });
    if (existingUserRole) {
      throw {
        message: "Email already existing",
        error: true,
      };
    }

    user.user_roles = user.user_roles || [];
    user.user_roles.push(userRoleId);

    const venue_name = registration_data.venue_name;
    const country = registration_data.country;
    const company_name = registration_data.company_name;
    const social_link = registration_data.social_link;
    const organization_id = new ObjectId();

    if (role === user_role.VENUE_OWNER) {
      if (!venue_name || !country || !company_name) {
        throw {
          success: false,
          message: "Missing required fields for Venue Owner setup",
        };
      }
      await this.setupVenueOwner({
        venue_name,
        country,
        userId: user._id,
        organizationId: organization_id,
        company_name,
      });
    }

    const updatePayload: Partial<{ user_roles: ObjectId[]; organization: ObjectId; social_link: string }> = {
      user_roles: user.user_roles,
    };

    if (role === user_role.VENUE_OWNER && user.role === user_role.USER) {
      updatePayload.organization = organization_id;
      updatePayload.social_link = social_link;
    }

    const results = await Promise.allSettled([
      UserRepo.updateUser({ _id: user._id }, updatePayload),
      UserRolesSvc.createUserRoles({ _id: userRoleId, user: user._id, role, password: registration_data.password }),
    ]);

    const errors = results.filter((result) => result.status === "rejected");
    if (errors.length > 0) {
      console.error(
        "Errors during role assignment or setup:",
        errors.map((err) => err.reason),
      );
      throw {
        success: false,
        message: "Failed to complete some actions during registration",
        errors: errors.map((err) => err.reason),
      };
    }

    return this.handleSendEmailVerification({ user, role, device_payload }, true);
  }

  static async handleSendEmailVerification(
    payload: { user: Partial<TUser>; role: user_role; device_payload: DevicePayload },
    existing_user: Boolean,
  ) {
    const { user, role, device_payload } = payload;

    const tokenPayload = {
      _id: user._id,
      role: role,
      email: user.email,
      device_id: device_payload.device_id,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    const emailToken = generateVerificationToken(tokenPayload);
    const verification_link = `${VENUE_4_USE_URI}/verify-email/${emailToken}?role=${role}`;
    const subject = existing_user ? "Venue4Use: New Role" : "Venue4Use: Confirm Your Email Address";

    const filePath = path.join(process.cwd(), existing_user ? "email-template/existing-user.html" : "email-template/email-verification.html");

    let htmlContent = "";
    try {
      const content = fs.readFileSync(filePath, "utf8");
      htmlContent = content
        .replace("{first_name}", user.first_name || "User")
        .replace("{verification_link}", verification_link)
        .replace("{role}", getRoleDisplayName(role));
    } catch (error) {
      console.error("Error reading email template:", error);
      throw new Error("Failed to load email template");
    }

    const authPayload = {
      user: user._id,
      accessToken,
      refreshToken,
      ...(role === USER_ROLES.ADMIN && { status: AuthStatus.ACTIVE }),
      ...device_payload,
    };

    try {
      await Promise.allSettled([
        AuthRepo.createToken(authPayload),
        handleSendEmail({
          to: user.email,
          subject,
          html: htmlContent,
        }),
      ]);

      return { accessToken, refreshToken };
    } catch (error) {
      console.error("Error in email verification process:", error);
      throw new Error("Email verification process failed");
    }
  }

  static async setupVenueOwner(payload: { company_name: string; venue_name: string; country: string; userId: ObjectId; organizationId: ObjectId }) {
    const venueId = new ObjectId();
    const { country, company_name, venue_name, userId, organizationId } = payload;

    const [country_settings] = await CountrySettingSvc.getCountrySetting({ cca2: country });
    const commission = country_settings?.commission || 0;
    const rebate = country_settings?.rebate || 0;

    await Promise.allSettled([
      await VenueSvc.createVenue({
        _id: venueId,
        user: userId,
        name: venue_name,
        organization: organizationId,
        commission,
        rebate,
      }),
      await OrganizationSvc.createOrganization({
        _id: organizationId,
        name: `${company_name}`,
      }),
      await OrganizationMemberSvc.createOrganizationMember({
        organization: organizationId,
        assigned_roles: [OrgRoles.VENUE_OWNER],
        invited_user_id: userId,
        status: StatusType.ACCEPTED,
        all_venues: true,
        is_owner: true,
      }),
    ]);
  }

  static async login(
    email: string,
    password: string,
    role: user_role,
    device_payload?: { device_id: string; device: string; operating_system: string; browser: string },
  ) {
    try {
      const user = await UserRepo.getUser({ email: { $regex: new RegExp(`^${email}$`, "i") } });
      const query: any = { user: user._id };
      query.role = role === user_role.VENUE_OWNER ? { $in: [user_role.VENUE_OWNER, user_role.VENUE_LISTER] } : role;

      const userRole = await UserRolesRepo.getUserRoles(query);

      const validRoles = {
        [user_role.VENUE_OWNER]: [user_role.VENUE_OWNER, user_role.VENUE_LISTER],
        [user_role.USER]: [user_role.USER],
        [user_role.ADMIN]: [user_role.ADMIN],
      };

      if (!validRoles[role]?.includes(userRole.role)) {
        throw new Error("1002");
      }

      const userRoleModel = new MUserRoles(userRole);
      const isPasswordMatch = await userRoleModel.comparePassword(password);
      if (!isPasswordMatch) {
        throw new Error("1003");
      }

      const payload = {
        _id: user._id,
        role,
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
      await UserRepo.updateUser({ _id: user._id }, { role: role });
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

  static async switchUserRoles(user_id: ObjectId, data: any) {
    try {
      const user = await UserSvc.getUser({ _id: user_id });
      if (!user) throw new Error("User not found");

      const userRole = await UserRolesSvc.getUserRoles({ user: user._id, role: data.role });
      if (!userRole) throw new Error("User does not have this role");

      const { error } = validateRoleSchema(data);
      if (error) throw new Error("VALIDATION_ERROR");

      await UserRepo.updateUser({ _id: user._id }, { role: data.role });

      return {};
    } catch (error) {
      throw error;
    }
  }
}
