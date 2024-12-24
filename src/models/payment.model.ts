import { ObjectId } from "mongodb";

export type TPayment = {
  _id?: ObjectId;
  venue?: ObjectId;
  space?: ObjectId;
  enquiry?: ObjectId;
  custom_offer?: ObjectId;
  booking?: ObjectId;
  status?: string;
  user?: ObjectId;
  payment_id: string;
  payment_method: any;
  payment_method_id?: string;
  payment_amount: string;
  payment_currency: string;
  payment_object: string;
  client_secret?: string;
  payment_created: Date;
  refund_id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type UpdateStatusPayment = {
  status?: string;
  updatedAt?: Date;
};

export class MPayment implements Partial<TPayment> {
  _id?: ObjectId;
  venue?: ObjectId;
  space?: ObjectId;
  enquiry?: ObjectId;
  custom_offer?: ObjectId;
  booking?: ObjectId;
  status?: string;
  user?: ObjectId;
  payment_id: string;
  payment_method: any;
  payment_method_id?: string;
  payment_amount: string;
  payment_currency: string;
  payment_object: string;
  payment_created: Date;
  client_secret?: string;
  refund_id?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    {
      _id = new ObjectId(),
      venue,
      space,
      enquiry,
      booking,
      custom_offer,
      status,
      user,
      payment_id,
      payment_method,
      payment_method_id,
      payment_amount,
      payment_currency,
      payment_object,
      payment_created,
      client_secret,
      refund_id,
      createdAt = new Date(),
      updatedAt,
    } = {} as TPayment,
  ) {
    this._id = _id;
    this.venue = venue;
    this.space = space;
    this.enquiry = enquiry;
    this.status = status;
    this.booking = booking;
    this.user = user;
    this.custom_offer = custom_offer;
    this.payment_id = payment_id;
    this.payment_method = payment_method;
    this.payment_amount = payment_amount;
    this.payment_currency = payment_currency;
    this.payment_object = payment_object;
    this.payment_created = payment_created;
    this.payment_method_id = payment_method_id;
    this.client_secret = client_secret;
    this.status = status;
    this.refund_id = refund_id;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
