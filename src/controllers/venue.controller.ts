/* eslint-disable prettier/prettier */
/* eslint-disable no-unused-vars */
import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { space_status } from "../models/space.model";
import { user_role } from "../models/user.model";
import { venue_status } from "../models/venue.models";
import AdminSvc from "../services/admin.service";
import BookingSvc from "../services/booking.service";
import EnquirySvc from "../services/enquiries.service";
import SpaceSvc from "../services/space.service";
import UserSvc from "../services/user.service";
import VenueSvc from "../services/venue.service";
import { verifyToken } from "../utils/auth";
import { validateInvitedUserInformationSchema } from "../utils/organization-member/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { validateCreateVenueSchema, validateDeleteVenueSchema, validateGetVenueSchema, validateUpdateVenueSchema } from "../utils/venue/validation";

export default class VenueCtrl {
  /**
   * Retrieves a list of venues based on the provided query parameters.
   *
   * @param req - The Express request object containing the query parameters.
   * @param res - The Express response object to send the venue data.
   * @returns A response containing the list of venues, pagination details, and a success message.
   */
  static async getVenues(req: Request, res: Response) {
    const { error } = validateGetVenueSchema(req.query);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
    }

    const user = await UserSvc.getUser({ _id: new ObjectId(req.user._id as string) });
    if (!user) {
      return handleErrorResponse(res, {}, { code: "INVALID_USER" });
    }

    if (req?.tenant) {
      req.query["tenant_code"] = req.tenant.code;
    }

    const params = req.query;

    try {
      const result = await VenueSvc.processedVenuePagination(params, user, req?.venues);
      return handleResponse(res, result, "VENUE_FETCHED_SUCCESSFULLY");
    } catch (error: any) {
      return handleErrorResponse(res, error, { code: "VENUE_FETCH_FAILED" });
    }
  }

  static async countVenue(req: Request, res: Response) {
    try {
      const user = await UserSvc.getUser({ _id: new ObjectId(req.user._id) });
      if (!user) {
        return handleErrorResponse(res, {}, { code: "INVALID_USER" });
      }

      if (req?.tenant) {
        req.query["tenant_code"] = req.tenant.code;
      }

      const params = req.query;
      const result = await VenueSvc.processCountAdminVenues(params, user);

      return handleResponse(res, result, "COUNT_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "COUNT_FETCH_FAILED" });
    }
  }

  static async createVenue(req: Request, res: Response) {
    const { error } = validateCreateVenueSchema(req.body);
    const tenantCode = req?.tenant?.code

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

  static async updateVenue(req: Request, res: Response) {
    const venue_id = new ObjectId(req.params.venue_id);
    const payload = req.body;
    const user = req.user;
    const { error } = validateUpdateVenueSchema(req.body);
    if (error) {
      return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
    }
    try {
      const [venue]: any = await VenueSvc.getVenue({ _id: venue_id });
      if (!venue) {
        return handleErrorResponse(res, {}, { code: "VENUE_NOT_FOUND" });
      }

      const result = await VenueSvc.processVenueUpdate(payload, user, venue_id, venue);
      return handleResponse(res, result, "VENUE_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "VENUE_NOT_ADDED" });
    }
  }

  /**
   * Deletes a venue by the specified venue ID and the user ID of the user who is deleting the venue.
   *
   * @param req - The Express.js request object, which should contain the `venue_id` parameter and the `user` object with the `_id` property.
   * @param res - The Express.js response object, which will be used to send the response.
   * @returns A promise that resolves to the result of the venue deletion operation.
   */

  static async deleteMultipleVenues(req: Request, res: Response) {
    try {
      const { venue_ids } = req.body;

      const { error } = validateDeleteVenueSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
      }

      const venueIds = Array.isArray(venue_ids) ? venue_ids.map((id: string) => new ObjectId(id)) : [new ObjectId(venue_ids)];

      const existingVenues = await VenueSvc.getVenuesByIds(venueIds);

      if (existingVenues.length !== venueIds.length) {
        return handleErrorResponse(res, {}, { code: "SOME_VENUES_NOT_FOUND_OR_NOT_DRAFT" });
      }

      const idsToDelete = existingVenues.map((venue: any) => venue._id);
      const result = await VenueSvc.deleteVenues(idsToDelete);

      return handleResponse(res, result, "VENUES_DELETED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "VENUE_DELETION_FAILED" });
    }
  }

  static async deleteVenue(req: Request, res: Response) {
    try {
      const venueId = new ObjectId(req.params.id);
      const statusArray = ["HAPPENED", "ARCHIVED", "CANCELLED"];
      let userId: any;
      let venueQuery = {};
      const userRole = req.user.role;

      venueQuery = { _id: venueId };
      if (userRole !== "ADMIN") {
        userId = new ObjectId(req.user._id);
        venueQuery = { ...venueQuery, user: userId };
      }

      const data = {
        status: "FOR_DELETION",
        updatedAt: new Date(),
      };

      const [existingVenue]: any = await VenueSvc.getPaginatedVenues({ _id: venueId }, 0, 1);
      if (!existingVenue) {
        return handleErrorResponse(res, {}, { code: "VENUE_NOT_FOUND" });
      }

      const pageSize = 100;
      let skip = 0;
      const countSpaces = await SpaceSvc.countPaginatedSpaces({
        query: { "venue._id": venueId, status: { $ne: "DELETED" } },
      });

      if (countSpaces === 0) {
        const result = await VenueSvc.deleteVenue(venueId, data, existingVenue);
        return handleResponse(res, result, "VENUE_REQUESTED_FOR_DELETION_SUCCESSFUL");
      }

      const statusChangeData = {
        status: space_status.FOR_DELETION,
        updatedAt: new Date(),
      };
      const statusChangeTransactionClosing = {
        status: space_status.FOR_TRANSACTION_CLOSING,
        updatedAt: new Date(),
      };

      while (skip < countSpaces) {
        const associatedSpaces = await SpaceSvc.getPaginatedSpaces({
          query: { "venue._id": venueId, status: { $ne: "DELETED" } },
          skip,
          limit: pageSize,
          user_id: null,
        });

        for (const space of associatedSpaces) {
          const spaceId = space._id;
          const query = {
            space: spaceId,
            status: { $nin: statusArray },
          };

          const existingEnquiries = await EnquirySvc.getEnquiry(query);
          const existingBooking = await BookingSvc.getAllBookings(query);

          if (existingEnquiries.length > 0 && existingBooking.length > 0) {
            await SpaceSvc.updateSpaces(statusChangeTransactionClosing, { _id: spaceId });
            return handleErrorResponse(res, {}, { code: "VENUE_CAN_NOT_BE_DELETED_WITH_PENDING_ENQUIRIES_AND_BOOKINGS" });
          } else if (existingBooking.length > 0) {
            await SpaceSvc.updateSpaces(statusChangeTransactionClosing, { _id: spaceId });
            return handleErrorResponse(res, {}, { code: "VENUE_CAN_NOT_BE_DELETED_WITH_PENDING_BOOKINGS" });
          } else if (existingEnquiries.length > 0) {
            await SpaceSvc.updateSpaces(statusChangeTransactionClosing, { _id: spaceId });
            return handleErrorResponse(res, {}, { code: "VENUE_CAN_NOT_BE_DELETED_WITH_PENDING_ENQUIRIES" });
          } else {
            await SpaceSvc.updateSpaces(statusChangeData, { _id: spaceId });
            await VenueSvc.updateVenue(venueId, { status: venue_status.SPACE_FOR_DELETION, updatedAt: new Date() });
          }
        }

        skip += pageSize;
      }

      const result = await VenueSvc.deleteVenue(venueId, data, existingVenue);
      return handleResponse(res, result, "VENUE_REQUESTED_FOR_DELETION_SUCCESSFUL");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "VENUE_REQUEST_FOR_DELETION_FAILED" });
    }
  }

  static async getVenueNameIdAndStatus(req: Request, res: Response) {
    try {
      const userRole = req.user?.role;
      const { status } = req.query as any;
      const venues = req["venues"];
      const query: any = {};
      let statusArray: any;

      if (status) {
        statusArray = status.split(",").map((s: string) => s.trim());
        req.query.status = statusArray;
      }

      const { error } = validateGetVenueSchema(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR_MISSING_FIELDS" });
      }

      if (statusArray) {
        query.status = { $in: statusArray };
      }

      if (userRole !== "ADMIN") {
        query.organization = venues.organization;
      }

      if (req?.tenant) {
        query.tenant = req?.tenant?.code;
      }

      const result = await VenueSvc.getVenueNameIdAndStatus(query);
      return handleResponse(res, result, "VENUES SUCCESSFULLY FETCHED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "FAILED_TO_FETCH_VENUES" });
    }
  }

  static async getVenueDetails(req: Request, res: Response) {
    try {
      const userId = new ObjectId(req.user._id as string);
      const { status } = req.query as any;
      const query: any = {};

      const user = await UserSvc.getUser({ _id: userId });

      if (status) {
        const statusArray = status.split(",").map((s: string) => s.trim());
        query.status = { $in: statusArray };
      }

      if ([user_role.VENUE_LISTER, user_role.VENUE_OWNER].includes(user?.role)) {
        query.organization = user?.organization;
      }

      if (req?.tenant) {
        query.tenant = req?.tenant?.code;
      }

      query.deletedAt = null;

      const venues = await VenueSvc.getVenueDetails(query);
      return handleResponse(res, venues, "VENUE_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "VENUE_FETCH_FAILED" });
    }
  }

  static async transferOwnershipAccept(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const { first_name, last_name, password, phone_number } = req.body;

      const decodedToken = verifyToken(token);
      if (!decodedToken) return handleErrorResponse(res, {}, { code: "INVALID_TOKEN" });

      const { error } = validateInvitedUserInformationSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      await AdminSvc.handleOwnerTransfership({
        first_name,
        last_name,
        password,
        phone_number,
        user_id: decodedToken._id,
        email: decodedToken.email,
        role: decodedToken.role,
        venue_id: decodedToken.venue_id,
        country: decodedToken.country,
        organization_id: decodedToken.organization,
      });

      return handleResponse(res, {}, "TRANSFER_SUCCESS");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "TRANSFER_SUCCESS_FAILED" });
    }
  }

  static async transferOwnershipAcceptExisting(req: Request, res: Response) {
    try {
      const { token } = req.params;

      const decodedToken = verifyToken(token);
      if (!decodedToken) return handleErrorResponse(res, {}, { code: "INVALID_TOKEN" });

      const [venue] = await VenueSvc.getVenue({ _id: new ObjectId(decodedToken.venue_id) });

      const results = await AdminSvc.handleOwnerExistingTransfership({
        user_id: decodedToken._id,
        venue_id: decodedToken.venue_id,
        organization_id: decodedToken.organization,
      });

      return handleResponse(res, { results }, "TRANSFER_SUCCESS");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "TRANSFER_SUCCESS_FAILED" });
    }
  }
}
