import { ObjectId } from "mongodb";
import { TReceipt } from "../models/receipt.model";
import ReceiptRepo from "../repositories/receipt.repository";
import CounterSvc from "./counter.service";
import { CounterType } from "../models/counter.model";
import { formatDate, getVenueLocation } from "../utils/helpers";

export default class ReceiptSvc {
  static createReceipt(invoice: TReceipt) {
    return ReceiptRepo.createReceipt(invoice);
  }
  static getReceipt(query: any) {
    return ReceiptRepo.getReceipt(query);
  }
  static async generateReceipt(payload: any, enquiry: any, custom_offer: any) {
    const { enquiry_id } = payload;
    const current_date = new Date();
    const year = current_date.getFullYear().toString();

    let receipt_no: string = "";
    const existingReceipt = await ReceiptSvc.getReceipt({ enquiry: new ObjectId(enquiry_id) });

    if (!existingReceipt) {
      const counter_receipt = await CounterSvc.generateCounter({ type: CounterType.RECEIPT });
      const counterValueReceipt = counter_receipt.count.toString().padStart(3, "0");
      receipt_no = `REC-${counterValueReceipt}-${year}`;

      await ReceiptSvc.createReceipt({
        enquiry: new ObjectId(enquiry_id),
        receipt_no,
        customer: enquiry?.user?._id,
        receipt_date: new Date(),
        subtotal: custom_offer.user_computation.subtotal,
        taxes: 0.15,
        rebate: custom_offer.user_computation.rebate,
        total_amount: custom_offer.user_computation.grand_total,
        currency: custom_offer.currency || "SGD",
        createdAt: current_date,
      });
    }

    const results = {
      venue_name: custom_offer?.venue?.name,
      space_name: custom_offer?.space?.name,
      venue_location: getVenueLocation(custom_offer.venue),
      venue_country: custom_offer.venue.address.country,
      venue_postal: custom_offer.venue.address.postal_code,
      receipt_date: existingReceipt ? formatDate(existingReceipt.createdAt) : current_date,
      receipt_no: existingReceipt ? existingReceipt.receipt_no : receipt_no,
      booker_user: `${enquiry?.user?.first_name} ${enquiry?.user?.last_name}`,
      quantity: 1,
      price: parseFloat(custom_offer.user_computation.subtotal),
      rebate: `${parseFloat(custom_offer.user_computation.rebate) * 100}%`,
      grand_total: parseFloat(custom_offer.user_computation.grand_total),
      email: enquiry?.user.email,
      currency: custom_offer.currency,
    };
    return results;
  }
}
