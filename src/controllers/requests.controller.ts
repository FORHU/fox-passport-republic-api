import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { RequestStatus, RequestType, TRequests } from "../models/requests.model";
import RequestSvc from "../services/requests.service";
import UserSvc from "../services/user.service";
import { dateFormat } from "../utils/helpers";
import { handleErrorResponse, handleResponse } from "../utils/reponse";
import { validateApproveSchema, validateCreateRequests, validateGetRequests } from "../utils/requests/validation";

export default class RequestCtrl {
  static async getRequests(req: Request, res: Response) {
    const { request_id, user_id, venue_id, space_id, enquiry_id, custom_offer_id, booking_id, type } = req.query as any;

    try {
      const { error } = validateGetRequests(req.query);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR", message: "Invalid request query parameters." });
      }

      const query: any = {
        ...(request_id && { _id: new ObjectId(request_id) }),
        ...(user_id && { user: new ObjectId(user_id) }),
        ...(venue_id && { venue: new ObjectId(venue_id) }),
        ...(space_id && { space: new ObjectId(space_id) }),
        ...(enquiry_id && { enquiry: new ObjectId(enquiry_id) }),
        ...(custom_offer_id && { custom_offer: new ObjectId(custom_offer_id) }),
        ...(booking_id && { booking: new ObjectId(booking_id) }),
        ...(type && { type }),
        status: { $ne: "COMPLETED" },
      };
      const result = await RequestSvc.getRequests(query);
      return handleResponse(res, result, "SUCCESSFULLY_FETCHED_REQUESTS");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "FAILED_FETCH_REQUESTS", message: "Failed to fetch requests." });
    }
  }

  static async createRequest(req: Request, res: Response) {
    try {
      const { user_id, venue_id, space_id, enquiry_id, custom_offer_id, booking_id, type, status, description } = req.body;

      const { error } = validateCreateRequests(req.body);
      if (error) {
        return handleErrorResponse(res, error, { CODE: "VALIDATION_ERROR" });
      }

      const toObjectId = (id: string) => (id ? new ObjectId(id) : null);

      const data = {
        user: toObjectId(user_id),
        venue: toObjectId(venue_id),
        space: toObjectId(space_id),
        enquiry: toObjectId(enquiry_id),
        custom_offer: toObjectId(custom_offer_id),
        booking: toObjectId(booking_id),
        type,
        status,
        description,
      };

      const result = await RequestSvc.createRequest(data);
      return handleResponse(res, result, "SUCCESSFULLY_CREATED_REQUEST");
    } catch (error) {
      return handleErrorResponse(res, error, { CODE: "FAILED_TO_CREATE_REQUEST" });
    }
  }

  static async deleteRequest(req: Request, res: Response) {
    try {
      const request_id = req.params.id as any;

      const [existingRequest]: any = await RequestSvc.getRequests({ _id: new ObjectId(request_id) });
      if (!existingRequest) {
        return handleErrorResponse(res, 401, { CODE: "REQUEST_NOT_FOUND" });
      }

      const data: Partial<TRequests> = {
        deletedAt: new Date(),
        deletedBy: new ObjectId(req.user._id),
        status: RequestStatus.DELETED,
      };

      if (existingRequest.type === RequestType.USER) {
        await UserSvc.deleteUser(existingRequest.user._id, data);
      }

      const result = await RequestSvc.deleteRequest(request_id, data);
      return handleResponse(res, result, "SUCCESSFULLY_DELETED_REQUEST");
    } catch (error) {
      return handleErrorResponse(res, error, { CODE: "FAILED_TO_DELETE_REQUEST" });
    }
  }

  static async updateRequestToBook(req: Request, res: Response) {
    try {
      const request_id = new ObjectId(req.params.id);
      const { date, guests, venue_computation, user_computation, notes, currency } = req.body;

      const [existingRequest]: any = await RequestSvc.getRequests({ _id: request_id });
      if (!existingRequest) {
        return handleErrorResponse(res, 401, { CODE: "REQUEST_NOT_FOUND" });
      }

      const formattedDate = dateFormat(date);
      const update_request_data = {
        user: existingRequest.request_data.user,
        inbox: existingRequest.request_data.inbox,
        venue: existingRequest.request_data.venue,
        space: existingRequest.request_data.space,
        date: formattedDate,
        guests,
        venue_computation,
        user_computation,
        notes,
        currency,
        updatedAt: new Date(),
      };

      const result = await RequestSvc.updateRequest(request_id, { request_data: update_request_data });
      return handleResponse(res, result, "SUCCESSFULLY_UPDATED_REQUEST");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "FAILED_TO_UPDATE_REQUEST" });
    }
  }

  static async approveDeletion(req: Request, res: Response) {
    try {
      const Id = new ObjectId(req.params.id);
      const payload = req.body;
      const user = req.user;

      const { error } = validateApproveSchema(payload);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const result = await RequestSvc.approveDeletion(Id, payload, user);
      if (result.error_code) {
        return handleErrorResponse(res, result.CODE, { code: result.CODE }, result.error_code);
      }
      return handleResponse(res, result.data, "USER_DELETED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async approveUpdate(req: Request, res: Response) {
    try {
      const object_id = new ObjectId(req.params.id);
      const payload = req.body;
      const { error } = validateApproveSchema(payload);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      const result = await RequestSvc.approveUpdate(object_id, payload);

      if (result.error_code) {
        return handleErrorResponse(res, result.error_code, { code: result.code }, result.error_code);
      }
      return handleResponse(res, result.data, result.code);
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }
}
