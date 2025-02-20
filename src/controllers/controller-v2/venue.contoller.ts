/* eslint-disable prettier/prettier */
/* eslint-disable no-unused-vars */
import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import UserSvc from "../../services/user.service"; // TODO Create v2
import VenueSvc from "../../services/service-v2/venue.service";
import { handleErrorResponse, handleResponse } from "../../utils/reponse";
import { validateCreateVenueSchema } from "../../utils/venue/validation";
import { validateGetVenueSchema } from "../../utils/admin/validation";

export default class VenueCtrl {
  /**
   * Retrieves a list of venues based on the provided query parameters.
   *
   * @param req - The Express request object containing the query parameters.
   * @param res - The Express response object to send the venue data.
   * @returns A response containing the list of venues, pagination details, and a success message.
   */

  static async createVenue(req: Request, res: Response) {
    const { error } = validateCreateVenueSchema(req.body);
    const tenantCode = req?.tenant?.code;

    if (tenantCode) {
      req.body.tenant = tenantCode;
    }

    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
    }
    try {
      const user = await UserSvc.getUser({ _id: new ObjectId(req.user._id as string) });
      if (!user) {
        return handleErrorResponse(res, { error }, { code: "INVALID_USER" });
      }

      const venueResult = await VenueSvc.processVenueCreation(user, req.body);
      return handleResponse(res, { _id: venueResult?.insertedId }, "VENUE_ADDED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "VENUE_NOT_ADDED" });
    }
  }

  static async getVenueName(req: Request, res: Response) {
    try {
      const { name } = req.query;

      const lowerCaseName = (name as string).toLowerCase();
      const result = await VenueSvc.getVenueName({ name_lower_case: lowerCaseName });

      return handleResponse(res, result, "VENUE_FETCHED_SUCCESSFULY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "VENUE_NOT_FETCHED" });
    }
  }

  // static async getVenues(req: Request, res: Response) {
  //   const { error } = validateGetVenueSchema(req.query);
  //   if (error) {
  //     return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
  //   }

  //   const user = await UserSvc.getUser({ _id: new ObjectId(req.user._id as string) });
  //   if (!user) {
  //     return handleErrorResponse(res, {}, { code: "INVALID_USER" });
  //   }

  //   if (req?.tenant) {
  //     req.query["tenant_code"] = req.tenant.code;
  //   }

  //   const params = req.query;

  //   try {
  //     const result = await VenueSvc.processedVenuePagination(params, user, req?.venues);
  //     return handleResponse(res, result, "VENUE_FETCHED_SUCCESSFULLY");
  //   } catch (error: any) {
  //     return handleErrorResponse(res, error, { code: "VENUE_FETCH_FAILED" });
  //   }
  // }
}
