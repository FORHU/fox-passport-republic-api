import { ObjectId } from "mongodb";
import RequestRepo from "../repositories/requests.repository";
import { MRequests, RequestStatus, RequestType, TRequests } from "../models/requests.model";
import UserSvc from "./user.service";
import VenueSvc from "./venue.service";
import SpaceSvc from "./space.service";
import EnquirySvc from "./enquiries.service";
import CustomOfferSvc from "../services/custom-offer.service";
import BookingSvc from "./booking.service";
import PricingSvc from "./pricing.service";
import { TUser } from "../models/user.model";
import { space_status } from "../models/space.model";

export default class RequestSvc {
  static async getRequests(query: any) {
    return RequestRepo.getRequests(query);
  }
  static async createRequest(data: Partial<MRequests>) {
    return RequestRepo.createRequest(data);
  }

  static async deleteRequest(request_id: ObjectId, data: Partial<TRequests>) {
    return RequestRepo.deleteRequest(request_id, data);
  }

  static async updateRequest(request_id: ObjectId, data: Partial<TRequests>) {
    return RequestRepo.updateRequest(request_id, data);
  }

  static async approveDeletion(Id: ObjectId, payload: any, user: TUser, tenant?: any) {
    const user_id = new ObjectId(user._id);
    const { type } = payload as any;
    const data = {
      deletedAt: new Date(),
      deletedBy: user_id,
      status: RequestStatus.DELETED,
    };

    switch (type) {
      case RequestType.USER:
        const existingUser = await UserSvc.getUser({ _id: Id });
        if (!existingUser) {
          return { error_code: 404, CODE: "USER_NOT_FOUND" };
        }
        await UserSvc.deleteUser(Id, data);
        break;
      case RequestType.VENUE:
        const [existingVenue] = await VenueSvc.getVenue({ _id: Id });
        if (!existingVenue) {
          return { error_code: 404, CODE: "VENUE_NOT_FOUND" };
        }
        await VenueSvc.updateVenue(Id, data, tenant);
        break;
      case RequestType.SPACE:
        const existingSpace = await SpaceSvc.getSpace({ _id: Id });
        if (!existingSpace) {
          return { error_code: 404, CODE: "SPACE_NOT_FOUND" };
        }
        await SpaceSvc.updateSpaces({ deletedAt: new Date(), deletedBy: data.deletedBy, status: space_status.DELETED }, { _id: Id });
        break;
      case RequestType.ENQUIRY:
        const [existingEnquiry] = await EnquirySvc.getEnquiry({ _id: Id });
        if (!existingEnquiry) {
          return { error_code: 404, CODE: "ENQUIRY_NOT_FOUND" };
        }
        await EnquirySvc.deleteEnquiry(Id, data);
        break;
      case RequestType.CUSTOM_OFFER:
        const [existingCustomOffer] = await CustomOfferSvc.getCustomOffer({ _id: Id });
        if (!existingCustomOffer) {
          return { error_code: 404, CODE: "CUSTOM_OFFER_NOT_FOUND" };
        }
        await CustomOfferSvc.updateCustomOffer(Id, data, null);
        break;
      case RequestType.BOOKING:
        const [existingBooking] = await BookingSvc.getBookings({ _id: Id }, 0, 1);
        if (!existingBooking) {
          return { error_code: 404, CODE: "BOOKING_NOT_FOUND" };
        }
        await BookingSvc.updateBooking(Id, data);
        break;
      default:
        return { error_code: 400, CODE: "INVALID_REQUEST_TYPE" };
    }
    const result = await RequestRepo.approveDeletion(Id, data);
    return { data: result };
  }

  static async approveUpdate(Id: ObjectId, payload: any, tenant?: any) {
    const { type } = payload;
    const object_id = Id;

    switch (type) {
      case RequestType.SPACE: {
        const query = { query: { _id: object_id }, skip: 0, limit: 1, user_id: null };
        const [existingSpace] = await SpaceSvc.getPaginatedSpaces(query);
        if (!existingSpace) {
          return { error_code: 404, code: "SPACE_NOT_FOUND" };
        }
        const [existingRequest]: any = await RequestSvc.getRequests({
          space: object_id,
          status: RequestStatus.UPDATING_REQUEST,
          description: { $ne: "Request to update pricing" },
        });
        if (!existingRequest) {
          return { error_code: 404, code: "REQUEST_NOT_FOUND" };
        }

        const [price_update_request] = await RequestSvc.getRequests({
          space: object_id,
          status: RequestStatus.UPDATING_REQUEST,
          description: "Request to update pricing",
        });

        const existingPrice: any = await PricingSvc.getPrice({ space_id: object_id });
        if (price_update_request && existingPrice) {
          const pricingData = price_update_request.request_data.pricing;
          await PricingSvc.updatePrice(existingPrice.space_id, pricingData);
          await RequestSvc.updateRequest(price_update_request._id, { status: RequestStatus.COMPLETED });
        }

        const data = {
          ...existingRequest.request_data,
          pricing: existingPrice._id,
        };

        const result = await SpaceSvc.updateSpaces(data, { _id: object_id });
        await RequestSvc.updateRequest(existingRequest._id, { status: RequestStatus.COMPLETED });
        return { data: result, code: "SPACE_UPDATED_SUCCESSFULLY" };
      }

      case RequestType.VENUE: {
        const [existingVenue] = await VenueSvc.getPaginatedVenues({ _id: object_id }, 0, 1);
        if (!existingVenue) {
          return { error_code: 404, code: "VENUE_NOT_FOUND" };
        }
        const [existingRequest]: any = await RequestSvc.getRequests({ venue: object_id, status: RequestStatus.UPDATING_REQUEST });
        if (!existingRequest) {
          return { error_code: 404, code: "REQUEST_NOT_FOUND" };
        }

        const data = existingRequest.request_data;
        const result = await VenueSvc.updateVenue(object_id, data, tenant);
        await this.updateRequest(existingRequest._id, { status: RequestStatus.COMPLETED });
        return { data: result, code: "SPACE_UPDATED_SUCCESSFULLY" };
      }

      default:
        return { error_code: 400, code: "INVALID_REQUEST_TYPE", message: "Invalid request type." };
    }
  }
}
