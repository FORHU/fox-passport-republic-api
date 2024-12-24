import { ObjectId } from "mongodb";
import { InvoiceStatus, TInvoice } from "../models/invoice.model";
import InvoiceRepo from "../repositories/invoice.repository";
import CustomeOfferSvc from "./custom-offer.service";
import CounterSvc from "./counter.service";
import { CounterType } from "../models/counter.model";
import { getVenueCountry, getVenueLocation } from "../utils/helpers";
import { formatDate } from "../models/enquiries.model";

export default class InvoiceSvc {
  static createInvoice(invoice: TInvoice) {
    return InvoiceRepo.createInvoice(invoice);
  }
  static getInvoice(query: any) {
    return InvoiceRepo.getInvoice(query);
  }
  static updateInvoice(query: any, updateData: any) {
    return InvoiceRepo.updateInvoice(query, updateData);
  }

  static async generateInvoice(payload: any, price: any, enquiry: any) {
    const { enquiry_id } = payload;
    const current_date = new Date();

    let invoiceNo = null;

    const existingInvoice = await InvoiceSvc.getInvoice({ enquiry: new ObjectId(enquiry_id) });
    const [custom_offer]: any = await Promise.allSettled([ CustomeOfferSvc.getCustomOffer({ enquiry_id: new ObjectId(enquiry_id) })]);
    if (!existingInvoice) {
      const counter = await CounterSvc.generateCounter({ type: CounterType.INVOICE });
      const year = current_date.getFullYear().toString();
      const counterValue = counter.count.toString().padStart(3, "0");
      invoiceNo = `INV-${counterValue}-${year}`;

      await this.createInvoice({
        invoice_no: invoiceNo,
        customer: enquiry.user._id,
        subtotal: custom_offer?.value[0].user_computation?.subtotal,
        rebate: parseFloat(custom_offer?.value[0].user_computation?.rebate),
        total_amount: parseFloat(custom_offer?.value[0].user_computation?.grand_total),
        status: InvoiceStatus.SENT,
        notes: `ACCEPTED OFFER`,
        currency: custom_offer?.value[0]?.currency,
        createdAt: current_date,
        enquiry: enquiry._id,
        custom_offer: custom_offer?.value[0]._id,
      });
    }

    const results = {
      space_name: custom_offer?.value[0].space?.name,
      venue_location: getVenueLocation(custom_offer?.value[0].venue),
      venue_country: getVenueCountry(custom_offer?.value[0].venue.address.country),
      venue_postal: custom_offer?.value[0].venue.address.postal_code,
      invoice_date: formatDate(current_date.toISOString()),
      invoice_no: !existingInvoice ? invoiceNo : existingInvoice?.invoice_no,
      booker_user: `${enquiry?.user?.first_name} ${enquiry?.user?.last_name}`,
      quantity: 1,
      price: parseFloat(custom_offer?.value[0].user_computation.subtotal),
      rebate: `${parseFloat(custom_offer?.value[0].user_computation.rebate) * 100}%`,
      grand_total: parseFloat(custom_offer?.value[0].user_computation.grand_total),
      email: enquiry?.user.email,
      cleaning_fee: price.cleaning_fee || 0,
      currency: custom_offer?.value[0]?.currency,
    };

    return results;
  }
}
