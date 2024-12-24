import { ObjectId } from "mongodb";

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  VOID = "VOID",
}

export type TInvoice = {
  _id?: ObjectId;
  invoice_no?: string;
  enquiry?: ObjectId;
  custom_offer?: ObjectId;
  customer: ObjectId;
  invoice_date?: Date;
  subtotal: number;
  taxes?: number;
  rebate?: number;
  total_amount: number;
  status: InvoiceStatus;
  notes?: string;
  invoice_url?: string;
  invoice_data?: any;
  currency: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class MInvoice implements Partial<TInvoice> {
  _id?: ObjectId;
  invoice_no?: string;
  enquiry?: ObjectId;
  custom_offer?: ObjectId;
  customer?: ObjectId;
  invoice_date?: Date;
  subtotal: number;
  taxes?: number;
  rebate?: number;
  total_amount: number;
  status: InvoiceStatus;
  notes?: string;
  invoice_url?: string;
  invoice_data?: any;
  currency: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor({
    _id = new ObjectId(),
    customer,
    enquiry,
    custom_offer,
    invoice_date = new Date(),
    subtotal,
    taxes,
    rebate,
    total_amount,
    status = InvoiceStatus.DRAFT,
    notes,
    invoice_no,
    invoice_url,
    invoice_data,
    currency,
    createdAt = new Date(),
    updatedAt,
  }: Partial<TInvoice> = {}) {
    this._id = _id;
    this.invoice_no = invoice_no;
    this.customer = customer;
    this.enquiry = enquiry;
    this.custom_offer = custom_offer;
    this.invoice_date = invoice_date;
    this.subtotal = subtotal || 0;
    this.taxes = taxes || 0;
    this.rebate = rebate || 0;
    this.total_amount = total_amount || 0;
    this.status = status;
    this.notes = notes || "";
    this.invoice_url = invoice_url;
    this.invoice_data = invoice_data;
    this.currency = currency || "";
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
