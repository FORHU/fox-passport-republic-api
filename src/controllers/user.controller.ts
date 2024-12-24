/* eslint-disable prettier/prettier */
import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import UserRepo from "../repositories/user.repository";
import UserSvc from "../services/user.service";
import { LookupFields } from "../types/common";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { validateUpdateUserSchema } from "../utils/user/validation";

export default class AuthCtrl {
  static async updateUser(req: Request, res: Response) {
    const id = new ObjectId(req.params.id);
    const { email, first_name, last_name, profile_picture, company_name, phone_number, venue_name, country, date_of_birth, zip_code, username } =
      req.body;

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

    try {
      let query = {};
      if (id) {
        query = { _id: id };
      } else {
        query = { _id: new ObjectId(req?.user?._id) };
      }

      const user = await UserSvc.getUser(query);
      if (!user) {
        return handleErrorResponse(res, "", { code: "USER_NOT_FOUND" });
      }

      if (email) {
        const existingUser = await UserSvc.getUser({ email: { $regex: new RegExp(`^${email}$`, "i") } });
        if (existingUser) {
          throw {
            message: "Email already in use",
            error: true,
          };
        }
      }

      const payload = {
        ...(email && { email }),
        ...(first_name && { first_name }),
        ...(last_name && { last_name }),
        ...(profile_picture && { profile_picture: new ObjectId(profile_picture) }),
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
      const query = { _id: new ObjectId(req?.user?._id) };
   
      const result = await UserSvc.getUserInfo(query);
      return handleResponse(res, result, "USER_FETCHED_SUCCESFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "USER_FETCH_FAILED" });
    }
  }

  static async deleteUser(req: Request, res: Response) {
    try {
      const userId = new ObjectId(req?.user?._id);

      const existingUser = await UserSvc.getUser({ _id: userId });
      if (!existingUser) {
        return handleErrorResponse(res, 401, { code: "USER_NOT_FOUND" });
      }

      const data = {
        deletedAt: new Date(),
        deletedBy: userId,
        status: "INACTIVE",
      };
      const result = await UserSvc.deleteUser(userId, data);
      return handleResponse(res, result, "DELETED_USER_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "USER_DELETE_FAILED" });
    }
  }
}
