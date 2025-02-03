import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { IS_ENQUIRY_MICROSERVICES } from "../config";
import CustomOfferSvc from "../services/custom-offer.service";
import EnquirySvc from "../services/enquiries.service";
import ReceiptSvc from "../services/receipt.service";
import { handleErrorResponse } from "../utils/reponse";

export default class ReceiptCtrl {
  static async generateReceipt(req: Request, res: Response) {
    try {
      const { enquiry_id } = req.body;

      let enquiry = null;
      if (IS_ENQUIRY_MICROSERVICES) {
        const { enquiries } = await EnquirySvc.getEnquiriesFromMicroservice({ enquiry_id });
        [enquiry] = enquiries;
      } else {
        [enquiry] = await EnquirySvc.getEnquiries({ _id: new ObjectId(enquiry_id) }, 0, 1);
      }

      if (!enquiry) {
        return handleErrorResponse(res, {}, { code: "ENQUIRY_NOT_FOUND" });
      }

      const [custom_offer]: any = await CustomOfferSvc.getCustomOffer({ enquiry_id: new ObjectId(enquiry_id) });
      if (!custom_offer) {
        return handleErrorResponse(res, {}, { code: "CUSTOM_OFFER_NOT_FOUND" });
      }
  
      const result = await ReceiptSvc.generateReceipt(req.body, enquiry, custom_offer);

      return res.json({ result });
    } catch (error) {
      handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }
}
