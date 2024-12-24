import { ObjectId } from "mongodb";

export enum account_transcation_status {
  COMPLETED = "COMPLETED",
  PENDING = "PENDING",
  FAILED = "FAILED",
}

export type TStripeAccountTransaction = {
  _id?: ObjectId;
  stripe_account?: ObjectId;
  payment?: ObjectId;
  venue?: ObjectId;
  venue_owner?: ObjectId;
  space?: ObjectId;
  status?: account_transcation_status;
  amount?: number;
  enquiry?: ObjectId;
  recurring?: Boolean;
  message?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TTUpdateStripeAccountTransaction = {
  _id?: ObjectId;
  stripe_account?: ObjectId;
  status?: account_transcation_status;
  amount?: number;
  payment?: ObjectId;
  venue?: ObjectId;
  venue_owner?: ObjectId;
  space?: ObjectId;
  enquiry?: ObjectId;
  recurring?: Boolean;
  message?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class MStripeAccountTransaction implements Partial<TStripeAccountTransaction> {
  _id?: ObjectId;
  stripe_account?: ObjectId;
  payment?: ObjectId;
  venue?: ObjectId;
  venue_owner?: ObjectId;
  space?: ObjectId;
  status?: account_transcation_status;
  amount?: number;
  enquiry?: ObjectId;
  recurring?: Boolean;
  message?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    {
      _id = new ObjectId(),
      stripe_account,
      amount,
      enquiry,
      recurring = false,
      payment,
      venue,
      venue_owner,
      space,
      message,
      createdAt = new Date(),
      updatedAt,
      status = account_transcation_status.PENDING,
    } = {} as TStripeAccountTransaction,
  ) {
    this._id = _id;
    this.amount = amount;
    this.enquiry = enquiry;
    this.stripe_account = stripe_account;
    this.payment = payment;
    this.venue = venue;
    this.venue_owner = venue_owner;
    this.space = space;
    this.status = status;
    this.message = message;
    this.recurring = recurring;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
