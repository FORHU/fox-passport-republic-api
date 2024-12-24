import { ObjectId } from "mongodb";

export enum ReceiptStatus {
  DRAFT = "DRAFT",
  SENT = "SENT",
  PAID = "PAID",
  OVERDUE = "OVERDUE",
  VOID = "VOID",
}

export type TReceipt = {
  _id?: ObjectId;
  receipt_no?: string;
  customer: ObjectId;
  enquiry?: ObjectId;
  receipt_date?: Date;
  subtotal: number;
  taxes?: number;
  rebate?: number;
  total_amount: number;
  currency: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class MReceipt implements Partial<TReceipt> {
  _id?: ObjectId;
  receipt_no?: string;
  customer?: ObjectId;
  enquiry?: ObjectId;
  receipt_date?: Date;
  subtotal: number;
  taxes?: number;
  rebate?: number;
  total_amount: number;
  currency: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor({
    _id = new ObjectId(),
    customer,
    enquiry,
    receipt_date = new Date(),
    subtotal,
    taxes,
    rebate,
    total_amount,
    receipt_no,
    currency,
    createdAt = new Date(),
    updatedAt,
  }: Partial<TReceipt> = {}) {
    this._id = _id;
    this.receipt_no = receipt_no;
    this.customer = customer;
    this.enquiry = enquiry;
    this.receipt_date = receipt_date;
    this.subtotal = subtotal || 0;
    this.taxes = taxes || 0;
    this.rebate = rebate || 0;
    this.total_amount = total_amount || 0;
    this.currency = currency || "";
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
