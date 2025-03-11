import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { IS_ENQUIRY_MICROSERVICES } from "../config";
import CustomOfferSvc from "../services/custom-offer.service";
import EnquirySvc from "../services/enquiries.service";
import { consructCustomOfferQuery } from "../utils/custom-offer/helpers";
import {
  validateCreateCOSchema,
  validateGetCOSchema,
  validateGetOneCustomOffer,
  validateUpdateCOSchema,
  validateUpdateOfferStatusSchema,
} from "../utils/custom-offer/validation";
import { dateFormat } from "../utils/helpers";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

export default class CustomOfferCtrl {
  static async createCustomOffer(req: Request, res: Response) {
    try {
      const { inbox_id } = req.body;

      const { error } = validateCreateCOSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      let enquiry = null;
      if (IS_ENQUIRY_MICROSERVICES) {
        const { enquiries } = await EnquirySvc.getEnquiriesFromMicroservice({ inbox_id });
        [enquiry] = enquiries;
      } else {
        [enquiry] = await EnquirySvc.getEnquiries({ "inbox._id": new ObjectId(inbox_id as string) }, 0, 1);
      }
      if (!enquiry) {
        return handleErrorResponse(res, error, { code: "ENQUIRY_NOT_FOUND_FOR_CREATE_OFFER" });
      }

      const createdCustomOffer = await CustomOfferSvc.createCustomOffer(req.body, enquiry, req?.user, req?.tenant);
      return handleResponse(res, createdCustomOffer, "CUSTOM_OFFER_SENT");
    } catch (error) {
      console.log({ error });
      return handleErrorResponse(res, error, { code: "CUSTOM_OFFER_NOT_SENT" });
    }
  }

  static async getCustomOffer(req: Request, res: Response) {
    try {
      const params = req.query as any;

      const { error } = validateGetCOSchema(params);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_FAILED_MISSING_REQUIRED_FIELDS" });
      }

      const query = consructCustomOfferQuery(params);

      const customOffers = await CustomOfferSvc.getCustomOffer(query);
      return handleResponse(res, customOffers, "CUSTOM_OFFERS_FOUND");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "CUSTOM_OFFERS_NOT_FOUND" });
    }
  }

  static async updateCustomOffer(req: Request, res: Response) {
    try {
      const { date, guests, venue_computation, user_computation, agree_to_terms, message_to_owner, currency, status } = req.body;
      const custom_offer_id = new ObjectId(req.params.id);
      const userRole = req?.user?.role;

      const { error } = validateUpdateCOSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_FAILED_MISSING_REQUIRED_FIELDS" });
      }
      const formattedDate = dateFormat(date);

      const [offer]: any = await CustomOfferSvc.getCustomOffer({
        _id: custom_offer_id,
      });

      if (!offer) {
        return handleErrorResponse(res, error, { code: "CUSTOM_OFFER_NOT_FOUND_FOR_UPDATE_OFFER" });
      }

      const updatedOfferData = {
        ...(date && { date: formattedDate }),
        ...(guests && { guests }),
        ...(venue_computation && { venue_computation }),
        ...(user_computation && { user_computation }),
        ...(agree_to_terms && { agree_to_terms }),
        ...(message_to_owner && { message_to_owner }),
        ...(currency && { currency }),
        ...(status && { status }),
        updatedAt: new Date(),
      };

      const updatedOffer = await CustomOfferSvc.updateCustomOffer(custom_offer_id, updatedOfferData, offer, userRole);
      return handleResponse(res, updatedOffer, "CUSTOM_OFFER_UPDATED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "CUSTOM_OFFER_UPDATE_FAILED" });
    }
  }

  static async updateCustomOfferStatus(req: Request, res: Response) {
    try {
      const custom_offer_id = req.params.id;

      const { error } = validateUpdateOfferStatusSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_FAILED_MISSING_REQUIRED_FIELDS" });
      }

      const [offer]: any = await CustomOfferSvc.getCustomOffer({
        _id: new ObjectId(custom_offer_id),
      });
      if (!offer) {
        return handleErrorResponse(res, {}, { code: "CUSTOM_OFFER_NOT_FOUND_FOR_UPDATE_OFFER" });
      }

      const result = CustomOfferSvc.updateCustomOfferStatus(req.user._id, req.body, custom_offer_id, offer, req?.tenant);
      return handleResponse(res, result, "CUSTOM_OFFER_UPDATED");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "CUSTOM_OFFER_UPDATE_FAILED" });
    }
  }

  static async getOneCustomOffer(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const { error } = validateGetOneCustomOffer(req.params);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }

      const [result] = await CustomOfferSvc.getCustomOffer({ _id: new ObjectId(id) });
      return handleResponse(res, result, "CUSTOM_OFFER_FOUND");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "CUSTOM_OFFER_NOT_FOUND" });
    }
  }

  static async requestToBook(req: Request, res: Response) {
    try {
      const { inbox_id } = req.body;

      const { error } = validateCreateCOSchema(req.body);
      if (error) {
        return handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      let enquiry = null;
      if (IS_ENQUIRY_MICROSERVICES) {
        const { enquiries } = await EnquirySvc.getEnquiriesFromMicroservice({ inbox_id });
        [enquiry] = enquiries;
      } else {
        [enquiry] = await EnquirySvc.getEnquiries({ "inbox._id": new ObjectId(inbox_id) }, 0, 1);
      }

      if (!enquiry) {
        return handleErrorResponse(res, error, { code: "ENQUIRY_NOT_FOUND_FOR_CREATE_OFFER" });
      }

      const result = await CustomOfferSvc.requestToBook(req.body, enquiry, req.user, req?.tenant);

      return handleResponse(res, result, "REQUEST_FOR_BOOKING_SUCCESS");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "CUSTOM_OFFER_NOT_FOUND" });
    }
  }
}
