import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { IS_ENQUIRY_MICROSERVICES } from "../config";
import { user_role } from "../models/user.model";
import EnquirySvc from "../services/enquiries.service";
import SpaceSvc from "../services/space.service";
import UserSvc from "../services/user.service";
import { MESSAGE_CODE } from "../utils/constant";
import { validateCreateEnquiriesSchema, validateGetEnquiriesSchema, validateUpdateEnquiriesSchema } from "../utils/enquiries/validation";
import { logger } from "../utils/logger";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

export default class EnquiriesCtrl {
  static async createEnquiries(req: Request, res: Response) {
    try {
      const { space } = req.body;

      const { error } = validateCreateEnquiriesSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
      }
      const spaceId = new ObjectId(space as string);
      const _space = await SpaceSvc.getSpace({ _id: spaceId });
      if (!_space) {
        return handleErrorResponse(
          res,
          {},
          {
            code: 2002,
            status_code: MESSAGE_CODE["3001"].status_code,
          },
          MESSAGE_CODE["3001"].status_code,
          MESSAGE_CODE["3001"].message,
          MESSAGE_CODE["3001"].description,
        );
      }
      const result = await EnquirySvc.processEnquiryCreation(req.body, _space, req?.user, req?.tenant);

      return handleResponse(res, result, "ENQUIRY_ADDED_SUCCESSFULLY");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ERROR_ENQUIRY_NOT_ADDED]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "ERROR_ENQUIRY_NOT_ADDED" });
    }
  }

  static async getEnquiries(req: Request, res: Response) {
    try {
      const { error } = validateGetEnquiriesSchema(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_FAILED" });
      }

      const result = await EnquirySvc.getPaginatedEnquiries(req.query, req?.venues, req?.user);
      return handleResponse(res, result, "BOOKING_DATA_FETCHED");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[ENQUIRIES_FETCH_FAILED]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "ENQUIRIES_FETCH_FAILED" });
    }
  }

  static async countAllEnquiries(req: Request, res: Response) {
    try {
      const { excluded_status } = req.query;
      const userId = new ObjectId(req.user._id);
      const userData = await UserSvc.getUser({ _id: userId });
      const query: any = {};

      if (excluded_status) {
        const status = excluded_status as string;
        const excludedStatuses = status.split(",");
        if (excludedStatuses.length > 0) {
          query.status = { $nin: excludedStatuses };
        }
      }

      if ([user_role.VENUE_OWNER].includes(userData.role)) {
        query["organization"] = userData.organization;
      } else if ([user_role.USER].includes(userData.role)) {
        query["user._id"] = userId;
      }

      const result = await EnquirySvc.countAllEnquiries(query);
      return handleResponse(res, result, "COUNT_FETCHED_SUCCESSFULLY");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[INTERNAL_SERVER_ERROR]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async getEnquiry(req: Request, res: Response) {
    try {
      const { toggle_censor } = req.query as any;

      const enquiry_id = new ObjectId(req.params.id);
      const userId = new ObjectId(req?.user?._id);

      const { error } = validateGetEnquiriesSchema(req.query);

      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_FAILED" });
      }

      const censorPhoneNumber = toggle_censor === "true";

      const query = { _id: enquiry_id };

      const enquiries: any = IS_ENQUIRY_MICROSERVICES
        ? await EnquirySvc.getEnquiriesFromMicroservice({ enquiry_id })
        : await EnquirySvc.getEnquiries(query, 0, 1, censorPhoneNumber, userId);

      const result = {
        data: IS_ENQUIRY_MICROSERVICES ? [enquiries?.enquiries] : enquiries[0],
      };

      return handleResponse(res, result, "ENQUIRIES_FETCHED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "ENQUIRIES_FETCH_FAILED" });
    }
  }

  static async getOneEnquiryPhoto(req: Request, res: Response) {
    const { space_id } = req.query as any;

    if (!space_id) {
      return handleErrorResponse(res, "Space ID is required", { code: "MISSING_SPACE_ID" });
    }

    try {
      const enquiryPhoto = await EnquirySvc.getOneEnquiryPhoto(new ObjectId(space_id));
      return handleResponse(res, enquiryPhoto, "ENQUIRY_PHOTO_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "ERROR_FETCHING_ENQUIRY_PHOTO" });
    }
  }

  static async updateEnquiries(req: Request, res: Response) {
    try {
      const { status } = req.body;
      const enquiry_id = new ObjectId(req.params.id);

      const { error } = validateUpdateEnquiriesSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_FAILED" });
      }

      const updatedData = { status };
      if (IS_ENQUIRY_MICROSERVICES) {
        const microserviceResponse = await EnquirySvc.updateEnquiriesFromMicroservice(enquiry_id, updatedData);
        return handleResponse(res, microserviceResponse, "ENQUIRY_UPDATED_SUCCESSFULLY");
      }
      const result = await EnquirySvc.updateEnquiry({ _id: enquiry_id }, updatedData, req?.tenant);

      if (result.modifiedCount === 0) {
        return handleErrorResponse(res, new Error("No enquiries were updated"), { code: "UPDATE_FAILED" });
      }

      return handleResponse(res, result, "ENQUIRY_UPDATED_SUCCESSFULLY");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[INTERNAL_SERVER_ERROR]: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }
}
