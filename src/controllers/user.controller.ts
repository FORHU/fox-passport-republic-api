/* eslint-disable prettier/prettier */
import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import FileSvc from "../services/file.service";
import UserSvc from "../services/user.service";
import { extractFilePath } from "../utils/helpers";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { validateUpdateUserSchema } from "../utils/user/validation";
import { deleteSpaceFile } from "../utils/aws";
import StripeAccountSvc from "../services/stripe-account.service";
import { account_status } from "../models/stripe-account.model";
import { user_status } from "../models/user.model";

export default class AuthCtrl {
  static async updateUser(req: Request, res: Response) {
    const { error: validationError } = validateUpdateUserSchema(req.body);
    if (validationError) {
      const customMessages = validationError.details.map((detail) => {
        switch (detail.context.key) {
          case "email":
            return "Email is not valid";
          default:
            return detail.message;
        }
      });

      return handleErrorResponse(res, { message: customMessages.join(", ") }, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
    }
    const id = new ObjectId(req.params.id);
    req.body.email = req.body?.email?.toLowerCase();
    const { email, first_name, last_name, profile_picture, company_name, phone_number, venue_name, country, date_of_birth, zip_code, username } =
      req.body;

    try {
      let query = {};
      if (id) {
        query = { _id: id };
      } else {
        query = { _id: new ObjectId(req?.user?._id as string) };
      }

      const user = await UserSvc.getUser(query);
      if (!user) {
        return handleErrorResponse(res, "", { code: "USER_NOT_FOUND" });
      }

      if (email) {
        const existingUser = await UserSvc.getUser({ email });
        if (existingUser) {
          throw {
            message: "Email already in use",
            error: true,
          };
        }
      }

      if (profile_picture) {
        const file = await FileSvc.getFileById(user?.profile_picture as string);
        if (file) {
          const filePath = extractFilePath(file?.path);
          await Promise.allSettled([deleteSpaceFile(filePath), FileSvc.deleteFilesById(user?.profile_picture as string)]);
        }
      }

      const payload = {
        ...(email && { email }),
        ...(first_name && { first_name }),
        ...(last_name && { last_name }),
        ...(profile_picture && { profile_picture: new ObjectId(profile_picture as string) }),
        ...(company_name && { company_name }),
        ...(phone_number && { phone_number }),
        ...(venue_name && { venue_name }),
        ...(country && { country }),
        ...(date_of_birth && { date_of_birth }),
        ...(zip_code && { zip_code }),
        ...(username && { username }),
      };

      const result = await UserSvc.updateUser(query, payload);
      return handleResponse(res, result, "USER_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "USER_UPDATE_FAILED" });
    }
  }

  static async getUser(req: Request, res: Response) {
    try {
      const query = { _id: new ObjectId(req?.user?._id as string) };

      const result = await UserSvc.getUserInfo(query);
      return handleResponse(res, result, "USER_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "USER_FETCH_FAILED" });
    }
  }

  static async migrateUsers(req: Request, res: Response) {
    try {
      let userStripeAccountIds: ObjectId[] = [];

      const userStripeAccounts = await StripeAccountSvc.getAccounts({ status: account_status.COMPLETED });
      userStripeAccountIds = userStripeAccounts.map((account) => account.user);

      const userStripeAccountIdsStr = userStripeAccountIds.map((id) => id.toString());

      const activeUsers = await UserSvc.getUsers({ status: "ACTIVE" });
      const activeUserIdsStr = activeUsers.map((user) => user._id.toString());

      const inactivePendingUsers = await UserSvc.getUsers({ status: { $in: ["INACTIVE", "PENDING"] } });
      const inactivePendingUserIds = inactivePendingUsers.map((user) => user._id);

      const activeUsersWithStripe = activeUserIdsStr
        .filter((userIdStr) => userStripeAccountIdsStr.includes(userIdStr))
        .map((idStr) => new ObjectId(idStr));

      const activeUsersWithoutStripe = activeUserIdsStr
        .filter((userIdStr) => !userStripeAccountIdsStr.includes(userIdStr))
        .map((idStr) => new ObjectId(idStr));

      await UserSvc.updateManyUsers({ _id: { $in: activeUsersWithStripe } }, { fully_verified: true });

      await UserSvc.updateManyUsers({ _id: { $in: inactivePendingUserIds } }, { fully_verified: false });

      await UserSvc.updateManyUsers({ _id: { $in: activeUsersWithoutStripe } }, { fully_verified: false });

      const result = {
        verifiedActiveUsersWithStripe: activeUsersWithStripe.length,
        unverifiedInactivePendingUsers: inactivePendingUserIds.length,
        unverifiedActiveWithoutStripe: activeUsersWithoutStripe.length,
      };

      return handleResponse(res, result, "USER_VERIFICATION_MIGRATION_SUCCESSFUL");
    } catch (error) {
      console.error("Error migrating users:", error);
      return handleErrorResponse(res, error, { code: "USER_VERIFICATION_MIGRATION_FAILED" });
    }
  }

  static async deleteUser(req: Request, res: Response) {
    try {
      const userId = new ObjectId(req?.user?._id as string);

      const existingUser = await UserSvc.getUser({ _id: userId });
      if (!existingUser) {
        return handleErrorResponse(res, 401, { code: "USER_NOT_FOUND" });
      }

      const data = {
        deletedAt: new Date(),
        deletedBy: userId,
        status: "INACTIVE",
      };
      const result = await UserSvc.deleteUser(userId, data, existingUser?.role);
      return handleResponse(res, result, "DELETED_USER_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "USER_DELETE_FAILED" });
    }
  }

  static async getOnboardingStatus(req: Request, res: Response) {
    const user_id = req?.params.user_id;
    try {
      const result = await UserSvc.getOnboardingStatus(user_id);
      return handleResponse(res, result, "ONBOARDING_STATUS_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "ONBOARDING_STATUS_FETCH_FAILED" });
    }
  }
}
