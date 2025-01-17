/* eslint-disable indent */
import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { space_status } from "../models/space.model";
import { venue_status } from "../models/venue.models";
import AdminSvc from "../services/admin.service";
import BookingSvc from "../services/booking.service";
import EnquirySvc from "../services/enquiries.service";
import SpaceSvc from "../services/space.service";
import VenueSvc from "../services/venue.service";
import { logger } from "../utils/logger";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { validateCreateSpaceSchema, validateDeleteSpaceSchema, validateGetSpacesSchema, validateUpdateSpaceSchema } from "../utils/space/validation";
export default class SpaceCtrl {
  /**
   * Gets a paginated list of spaces based on query parameters.
   *
   * Accepts query parameters for filtering, sorting, pagination.
   * Returns paginated list of matching spaces with metadata.
   */

  static async getSpaces(req: Request, res: Response) {
    const { status } = req.query;
    if (typeof status === "string" && status.includes(",")) {
      req.query.status = status.split(",").map((s: string) => s.trim());
    }

    const { error } = validateGetSpacesSchema(req.query);
    if (error) return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
    const params = req.query;
    const user = req?.user;
    try {
      if (req?.tenant) {
        req.query.tenant_code = req?.tenant?.code;
      }
      const result = await SpaceSvc.processedSpacePagination({
        params,
        user,
      });
      return handleResponse(res, result, "SPACES_FETCHED");
    } catch (error: any) {
      logger.log({
        level: "info",
        message: `[SPACE]: SPACE FETCH ERROR: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "SPACES_FETCH_FAILED" });
    }
  }

  static async countSpace(req: Request, res: Response) {
    try {
      const venue_id = new ObjectId(req.params.id);

      const result = await AdminSvc.countAdminSpace({
        venue: venue_id,
        deletedAt: { $eq: null },
      });

      return handleResponse(res, result, "COUNT_FETCHED_SUCCESSFULLY");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[SPACE]: SPACE COUNT FETCH ERROR: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "COUNT_FETCH_FAILED" });
    }
  }

  static async createSpaces(req: Request, res: Response) {
    const { error } = validateCreateSpaceSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
    }
    try {
      const payload = req.body;
      const user = req?.user;

      const result: any = await SpaceSvc.createSpaces(payload, user);

      return handleResponse(res, { _id: result?.insertedId }, "SPACE_ADDED_SUCCESSFULLY");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[SPACE]: SPACE_CREATED_ERROR: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "SPACE_NOT_ADDED" });
    }
  }

  static async updateSpaces(req: Request, res: Response) {
    try {
      const spaceId = new ObjectId(req.params.id);
      const userRole = req?.user?.role;
      const payload = req.body;
      const space: any = await SpaceSvc.getSpace({ _id: spaceId });
      if (!space) {
        return handleErrorResponse(res, "INVALID_SPACE", { code: "INVALID_SPACE" });
      }

      const { error } = validateUpdateSpaceSchema(payload);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
      }

      const result = await SpaceSvc.processUpdateSpaces(payload, spaceId, space, userRole);

      return handleResponse(res, result, "SPACE_UPDATED_SUCCESSFULLY");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[SPACE]: SPACE_UPDATE_FAILED: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "SPACE_UPDATE_FAILED" });
    }
  }

  static async deleteMultipleSpaces(req: Request, res: Response) {
    try {
      const { space_ids } = req.body;

      const { error } = validateDeleteSpaceSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
      }

      const spaceIds = Array.isArray(space_ids) ? space_ids.map((id: string) => new ObjectId(id)) : [new ObjectId(space_ids)];

      const existingSpaces = await SpaceSvc.getMultipleSpaces({ _id: { $in: spaceIds } });

      if (existingSpaces.length !== spaceIds.length) {
        return handleErrorResponse(res, {}, { code: "SOME_SPACES_NOT_FOUND_OR_NOT_DRAFT" });
      }

      const idsToDelete = existingSpaces.map((space: any) => space._id);
      const result = await SpaceSvc.deleteMultipleSpaceByIds(idsToDelete);

      return handleResponse(res, result, "SPACES_DELETED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "SPACE_DELETION_FAILED" });
    }
  }

  static async getMostPopularSpaces(req: Request, res: Response) {
    const { error } = validateGetSpacesSchema(req.query);
    if (error) return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });

    const params = req.query;

    const result = await SpaceSvc.getMostPopularSpaces(params);
    return handleResponse(res, result, "MOST_POPULAR_SPACES");
  }

  static async getRecentlyListedSpaces(req: Request, res: Response) {
    const { status } = req.query as any;

    if (typeof status === "string" && status.includes(",")) {
      req.query.status = status.split(",").map((s: string) => s.trim());
    }

    const { error } = validateGetSpacesSchema(req.query);
    if (error) return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });

    if (req?.tenant) {
      req.query.tenant_code = req?.tenant?.code;
    }

    const params = req.query;
    try {
      const result = await SpaceSvc.getRecentlyListedSpaces({ params, user: req?.user });

      return handleResponse(res, result, "SPACES_FETCHED");
    } catch (error: any) {
      logger.log({
        level: "info",
        message: `[SPACE]: SPACE FETCH ERROR: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "SPACES_FETCH_FAILED" });
    }
  }

  static async getSpaceNameIdAndStatus(req: Request, res: Response) {
    try {
      const { status } = req.query as any;
      let statusArray: any;
      if (status) {
        statusArray = status.split(",").map((s: string) => s.trim());
        req.query.status = statusArray;
      }
      const { error } = validateGetSpacesSchema(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      if (req?.tenant) {
        req.query.tenant_code = req?.tenant?.code;
      }
      const params = req.query;
      const user = req.user;
      const space = await SpaceSvc.getSpaceNameIdAndStatus({ params, user });
      return handleResponse(res, space, "SPACES_FETCHED_SUCCESSFULLY");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[SPACE]: SPACE FETCH ERROR: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "SPACES_FETCH_FAILED" });
    }
  }

  static async getSpaceList(req: Request, res: Response) {
    try {
      const result = await SpaceSvc.getPaginatedSpaceList(req.query, req.user);
      return handleResponse(res, result, "SUBSCRIBED_SPACES_FETCHED_SUCCESSFULLY");
    } catch (error) {
      logger.log({
        level: "info",
        message: `[SPACE]: SUBSCRIBED SPACE FETCH ERROR: ${JSON.stringify(error)}`,
      });
      return handleErrorResponse(res, error, { code: "SUBSCRIBED_SPACES_FETCH_FAILED" });
    }
  }

  static async markSpaceForDeletion(req: Request, res: Response) {
    try {
      const spaceId = new ObjectId(req.params.id);
      const statusArray = ["HAPPENED", "ARCHIVED", "CANCELLED"];

      let userId: any;
      let query = {};
      let spaceQuery = {};
      const userRole = req.user.role;

      query = {
        space: spaceId,
        status: { $nin: statusArray },
      };

      spaceQuery = {
        _id: spaceId,
      };

      if (userRole !== "ADMIN") {
        userId = new ObjectId(req.user._id);
        spaceQuery = { ...spaceQuery, user: userId };
      }

      const existingSpace = await SpaceSvc.getSpace(spaceQuery);
      if (!existingSpace) {
        return handleErrorResponse(res, {}, { code: "SPACE_NOT_FOUND" });
      }

      const statusChangeData = {
        status: space_status.FOR_DELETION,
        updatedAt: new Date(),
      };

      const statusChangeTransactionClosing = {
        status: space_status.FOR_TRANSACTION_CLOSING,
        updatedAt: new Date(),
      };

      const existingEnquiries = await EnquirySvc.getEnquiry(query);
      const existingBooking = await BookingSvc.getAllBookings(query);

      if (existingEnquiries.length > 0 && existingBooking.length > 0) {
        await SpaceSvc.updateSpaces(statusChangeTransactionClosing, { _id: spaceId });
        return handleErrorResponse(res, {}, { code: "SPACE_CAN_NOT_BE_DELETED_WITH_PENDING_ENQUIRIES_AND_BOOKINGS" });
      } else if (existingBooking.length > 0) {
        await SpaceSvc.updateSpaces(statusChangeTransactionClosing, { _id: spaceId });
        return handleErrorResponse(res, {}, { code: "SPACE_CAN_NOT_BE_DELETED_WITH_PENDING_BOOKINGS" });
      } else if (existingEnquiries.length > 0) {
        await SpaceSvc.updateSpaces(statusChangeTransactionClosing, { _id: spaceId });
        return handleErrorResponse(res, {}, { code: "SPACE_CAN_NOT_BE_DELETED_WITH_PENDING_ENQUIRIES" });
      }

      await VenueSvc.updateVenue(existingSpace.venue, { status: venue_status.SPACE_FOR_DELETION });
      const result = await SpaceSvc.updateSpaces(statusChangeData, spaceQuery);

      return handleResponse(res, result.result, "SPACE_DELETED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "SPACE_DELETION_FAILED" });
    }
  }

  static async getCoordinates(req: Request, res: Response) {
    try {
      const { error } = validateGetSpacesSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
      }

      const coordinates = await SpaceSvc.getCoordinates(req.body);
      return handleResponse(res, coordinates, "COORDINATES_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "COORDINATES_FETCH_FAILED" });
    }
  }
}
