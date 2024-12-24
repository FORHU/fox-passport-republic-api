import { ObjectId } from "mongodb";

export type TStripeCustomer = {
  _id?: ObjectId;
  user: ObjectId;
  customer_id: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TTUpdateStripeCustomer = {
  _id?: ObjectId;
  user?: ObjectId;
  customer_id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class MStripeCustomer implements Partial<TStripeCustomer> {
  _id?: ObjectId;
  user: ObjectId;
  customer_id?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor({ _id = new ObjectId(), user, customer_id, createdAt = new Date(), updatedAt } = {} as TStripeCustomer) {
    this._id = _id;
    this.user = user;
    this.customer_id = customer_id;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
