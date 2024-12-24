import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import { IS_ENQUIRY_MICROSERVICES } from "../config";
import EnquirySvc from "../services/enquiries.service";
import InvoiceSvc from "../services/invoice.service";
import PricingSvc from "../services/pricing.service";
import { handleErrorResponse } from "../utils/reponse";

export default class InvoiceCtrl {
  static async getInvoice(req: Request, res: Response) {
    const _id = req.params.id as string;

    try {
      const result = await InvoiceSvc.getInvoice({ _id: new ObjectId(_id) });
      return res.json({ message: result });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async generateInvoice(req: Request, res: Response) {
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
        return handleErrorResponse(res, {}, { code: "ENQUIRY_NOT_FOUND_FOR_CREATE_OFFER" });
      }

      const price: any = await PricingSvc.getPrice({ space: enquiry?.pricing });
      if (!price) {
        return handleErrorResponse(res, {}, { code: "PRICE_NOT_FOUND" });
      }

      const results = await InvoiceSvc.generateInvoice(req.body, price, enquiry);

      return res.json({ results });
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }
}
