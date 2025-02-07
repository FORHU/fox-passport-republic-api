import { Request, Response } from "express";
import Joi from "joi";
import { ObjectId } from "mongodb";

import { OrgRoles, StatusType } from "../models/organization-member.model";
import { user_status } from "../models/user.model";
import AuthSvc from "../services/auth.service";
import CountrySettingSvc from "../services/country-setting.service";
import OrganizationSvc from "../services/organization.service";
import OrganizationMemberSvc from "../services/organization-member.service";
import UserSvc from "../services/user.service";
import VenueSvc from "../services/venue.service";
import { generateHash } from "../utils/auth";
import { validateEmailSchema, validateLoginSchema, validateRefreshTokenSchema, validateRegistrationSchema } from "../utils/auth/validation";
import { MESSAGE_CODE, USER_ROLES } from "../utils/constant";
import { generateGoogleAuthURL, getGoogleProfile, googleGetAccessToken } from "../utils/google/utils";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { getUAResult } from "../utils/ua-parser.util";

interface ResponseType {
  accessToken: string;
  refreshToken: string;
  venue_id?: ObjectId;
}

export default class AuthCtrl {
  /**
   * Registers a new user with the given email, password and role.
   *
   * Validates the email, password and role.
   * Calls the AuthSvc registration method to register the user.
   * Responds with a success or error message.
   */

  static async registrationViaEmail(req: Request, res: Response) {
    if (req.tenant) {
      req.body.tenant = req?.tenant;
    }

    const {
      email,
      password,
      role,
      phone_number,
      date_of_birth,
      first_name,
      last_name,
      company_name,
      venue_name,
      postal,
      country,
      social_link,
      tenant,
    } = req.body;

    const { error } = validateRegistrationSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_REGISTRATION_MISSING_FIELDS",
      });
    }

    try {
      const organizationId = new ObjectId();
      const venueId = new ObjectId();
      const userId = new ObjectId();

      //create venue and organization
      if (role === USER_ROLES.VENUE_OWNER) {
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
            ...(tenant && { tenant: tenant?.code }),
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

      const userAgentString = req.headers["user-agent"];
      const uaResult = getUAResult(userAgentString);

      const device_payload = {
        device_id: generateHash(),
        device: uaResult.device.type || "desktop",
        operating_system: uaResult.os.name,
        browser: uaResult.browser.name,
      };

      const { accessToken, refreshToken }: any = await AuthSvc.registration(
        {
          _id: userId,
          ...(tenant && { tenant: tenant?.code }),
          email: email.toLowerCase(),
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
          organization: organizationId,
          ...(role === USER_ROLES.ADMIN && {
            status: user_status.ACTIVE,
          }),
        },
        false,
        device_payload,
        tenant,
      );

      const response: ResponseType = {
        accessToken,
        refreshToken,
      };

      if (role === USER_ROLES.VENUE_OWNER) {
        response.venue_id = venueId;
      }

      return res.status(200).json(response);
    } catch (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_REGISTRATION_VIA_EMAIL",
      });
    }
  }

  static async sendEmailVerification(req: Request, res: Response) {
    const userId = req?.user?._id as string;
    try {
      await AuthSvc.sendEmailVerification(userId, req?.tenant);
      return handleResponse(res, {}, "EMAIL_VERIFICATION");
    } catch (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_EMAIL_VERIFICATION",
      });
    }
  }

  static async validateOtp(req: Request, res: Response) {
    const { otp_code } = req.body;
    const userId = req?.user?._id as string;
    try {
      await AuthSvc.validateOtp(userId, otp_code);
      return handleResponse(res, { success: "success" }, "EMAIL_VERIFICATION");
    } catch (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_VALIDATE_OTP",
      });
    }
  }

  /**
   * Logs in a user with the given email and password.
   *
   * Validates the email and password.
   * Calls the AuthSvc login method to authenticate.
   * Responds with a success or error message.
   */
  static async loginViaEmail(req: Request, res: Response) {
    const { email, password, role } = req.body;
    const { error } = validateLoginSchema(req.body);

    if (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_LOGIN_VIA_EMAIL",
        status_code: 400,
      });
    }

    try {
      const userAgentString = req.headers["user-agent"];
      const uaResult = getUAResult(userAgentString);

      const device_payload = {
        device_id: generateHash(),
        device: uaResult.device.type || "desktop",
        operating_system: uaResult.os.name,
        browser: uaResult.browser.name,
      };

      const result = await AuthSvc.login(email, password, role, device_payload);
      return res.status(200).json(result);
    } catch (error) {
      if (typeof error === "string" && MESSAGE_CODE[error as keyof typeof MESSAGE_CODE]) {
        return handleErrorResponse(
          res,
          error,
          {
            code: error,
            status_code: 404,
          },
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].status_code,
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].message,
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].description,
        );
      }
      return handleErrorResponse(res, error, {
        code: "ERROR_LOGIN_VIA_EMAIL",
      });
    }
  }

  static async generateGoogleAuthUrl(req: Request, res: Response) {
    const url = generateGoogleAuthURL();
    try {
      return handleResponse(res, url, "GOOGLE_ACCESS_AUTH_URL");
    } catch (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_GOOGLE_ACCESS_AUTH_URL",
      });
    }
  }

  static async googleAuthorization(req: Request, res: Response) {
    const code: string = req.query.code as string;
    try {
      const data = await googleGetAccessToken(code);
      const { access_token } = data;
      const profile = await getGoogleProfile(access_token);
      const { accessToken, refreshToken, email } = await AuthSvc.verifyGoogleLogin(profile);
      return handleResponse(res, { accessToken, refreshToken, email }, "GOOGLE_AUTHORIZATION");
    } catch (error) {
      if (typeof error === "string" && MESSAGE_CODE[error as keyof typeof MESSAGE_CODE]) {
        return handleErrorResponse(
          res,
          error,
          {
            code: error,
            status_code: 404,
          },
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].status_code,
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].message,
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].description,
        );
      }
      return handleErrorResponse(res, error, {
        code: "ERROR_GOOGLE_AUTHORIZATION",
      });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      const userId = req?.user?._id;
      const device_id = req?.user?.device_id;
      if (!userId) {
        return handleErrorResponse(res, userId, {
          code: "USER_ID_NOT_FOUND",
        });
      }

      const results = await AuthSvc.logout({ device_id });
      return handleResponse(res, results, "LOGOUT_SUCCESSFUL");
    } catch (error) {
      return handleErrorResponse(res, error, {
        code: "ERROR_LOGOUT_FAILED",
      });
    }
  }

  static async updateUserPassword(req: Request, res: Response) {
    try {
      const userId = new ObjectId(req?.user?._id);
      const old_password = req.body.old_password;
      const new_password = req.body.new_password;
      const schema = Joi.object({
        old_password: Joi.string().required(),
        new_password: Joi.string().required(),
      });
      const { error } = schema.validate({ old_password: old_password, new_password: new_password });
      if (error) {
        return handleErrorResponse(res, error, {
          code: "VALIDATION_ERROR",
        });
      }

      const user: any = await UserSvc.getUser({ _id: userId, deletedAt: null });

      if (!user) {
        return handleErrorResponse(res, userId, {
          code: "USER_NOT_FOUND",
        });
      }

      const isPasswordMatch = await AuthSvc.comparePassword(old_password, user);
      if (!isPasswordMatch) throw new Error("1003");

      await AuthSvc.changePassword(new_password, user._id);
      return handleResponse(res, {}, "USER_PASSWORD_UPDATED");
    } catch (err) {
      const error = err.message;
      if (typeof error === "string" && MESSAGE_CODE[error as keyof typeof MESSAGE_CODE]) {
        return handleErrorResponse(
          res,
          error,
          {
            code: error,
            status_code: 404,
          },
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].status_code,
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].message,
          MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].description,
        );
      }
      return handleErrorResponse(res, error, {
        code: "ERROR_USER_PASSWORD_UPDATE_FAILED",
      });
    }
  }

  static async refreshAccessToken(req: Request, res: Response) {
    const { refreshToken } = req.body;

    const { error } = validateRefreshTokenSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR", status_code: 400 });
    }

    try {
      const result = await AuthSvc.refreshToken(refreshToken);
      return handleResponse(res, result, "ACCESS_TOKEN_REFRESHED");
    } catch (err) {
      const error = err.message;
      const status_code = MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].status_code;
      const error_message = MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].message;
      return handleErrorResponse(
        res,
        error,
        {
          code: error_message || "ERROR_REFRESH_ACCESS_TOKEN",
          status_code,
        },
        MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].status_code,
        MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].message,
        MESSAGE_CODE[error as keyof typeof MESSAGE_CODE].description,
      );
    }
  }

  static async verifyEmail(req: Request, res: Response) {
    try {
      const token = req.params.token;
      await AuthSvc.verifyEmail(token);
      return handleResponse(res, {}, "EMAIL_VERIFIED_SUCCESSFULLY");
    } catch (error) {
      const isEmailAlreadyVerified = error.message === "EMAIL_ALREADY_VERIFIED";
      const errorMessage = isEmailAlreadyVerified ? "Email has already been verified." : "Invalid token provided.";
      const errorCode = isEmailAlreadyVerified ? "EMAIL_ALREADY_VERIFIED" : "ERROR_EMAIL_VERIFICATION_FAILED";

      return handleErrorResponse(res, errorMessage, { code: errorCode });
    }
  }

  static async accountRecovery(req: Request, res: Response) {
    try {
      const { email } = req.body;
      const { error } = validateEmailSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      const user = await UserSvc.getUser({ email: email, deletedAt: null });
      if (!user) {
        return handleErrorResponse(res, 400, { code: "EMAIL_DOES_NOT_EXIST_OR_HAS_BEEN_DELETED" });
      }

      await AuthSvc.accountRecovery(email, req?.tenant);

      return handleResponse(res, {}, "EMAIL_RECOVERY_LINK_SENT");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async passwordReset(req: Request, res: Response) {
    try {
      const token = req.params.token;
      if (!token) {
        handleErrorResponse(res, 400, { code: "INVALID_TOKEN" });
      }
      const result = await AuthSvc.passwordReset(token, req?.tenant);

      if (result) {
        return handleResponse(res, result, `PASSWORD_RESET_SUCCESFUL`);
      } else {
        return handleErrorResponse(res, 400, { code: "PASSWORD_RESET_FAILED_CONTROLLER" });
      }
    } catch (error) {
      return handleErrorResponse(res, error, { code: " INTERNAL_SERVER_ERROR" });
    }
  }

  static async newPasswordReset(req: Request, res: Response) {
    try {
      const { email } = await AuthSvc.decodeToken(req.params.token);

      const { password } = req.body;

      const user = await UserSvc.getUser({ email });
      if (!user) {
        return handleErrorResponse(res, 400, { code: "USER_NOT_FOUND" });
      }
      const result = await AuthSvc.newPasswordReset(password, email);
      if (result) {
        return handleResponse(res, {}, { code: "PASSWORD_RESET_SUCCESSFUL" });
      } else {
        return handleErrorResponse(res, {}, { code: "PASSWORD_RESET_FAILED" });
      }
    } catch (error) {
      return res.status(500).json({ message: "Internal server error." });
    }
  }
}
