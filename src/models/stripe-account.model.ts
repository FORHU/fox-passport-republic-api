import { ObjectId } from "mongodb";

export enum account_status {
  COMPLETED = "COMPLETED",
  PENDING = "PENDING",
  FAILED = "FAILED",
}

export type TStripeAccount = {
  _id?: ObjectId;
  user: ObjectId;
  stripe_account_id: string;
  status?: account_status;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TTUpdateStripeAccount = {
  _id?: ObjectId;
  user?: ObjectId;
  stripe_account_id: string;
  status?: account_status;
  createdAt?: Date;
  updatedAt?: Date;
};

export class MStripeAccount implements Partial<TStripeAccount> {
  _id?: ObjectId;
  user: ObjectId;
  stripe_account_id: string;
  status?: account_status;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    { _id = new ObjectId(), user, stripe_account_id, createdAt = new Date(), updatedAt, status = account_status.PENDING } = {} as TStripeAccount,
  ) {
    this._id = _id;
    this.user = user;
    this.stripe_account_id = stripe_account_id;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
