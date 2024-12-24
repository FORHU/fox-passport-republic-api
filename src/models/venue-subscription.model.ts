import { ObjectId } from "mongodb";

export enum PaymentMethod {
  COMMISSION = "COMMISSION",
  SUBSCRIPTION = "SUBSCRIPTION",
}

export type TVenueSubscription = {
  _id?: ObjectId;
  venue: ObjectId;
  user: ObjectId;
  status: string;
  fee: number;
  space_number: number;
  endDate: Date;
  subscription_id?: string;
  client_secret?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TVenueSubscriptionUpdateOptions = {
  _id?: ObjectId;
  venue?: ObjectId;
  user?: ObjectId;
  status?: string;
  fee?: number;
  space_number?: number;
  subscription_id?: string;
  client_secret?: string;
  endDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export class MVenueSubscription implements Partial<TVenueSubscription> {
  _id?: ObjectId;
  venue?: ObjectId;
  user: ObjectId;
  status?: string;
  fee?: number;
  space_number?: number;
  subscription_id?: string;
  client_secret?: string;
  endDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    {
      _id = new ObjectId(),
      venue,
      user,
      fee,
      space_number = 0,
      endDate,
      subscription_id,
      client_secret,
      status,
      createdAt = new Date(),
      updatedAt,
    } = {} as TVenueSubscription,
  ) {
    this._id = _id;
    this.venue = venue;
    this.user = user;
    this.fee = fee;
    this.space_number = space_number;
    this.endDate = endDate;
    this.subscription_id = subscription_id;
    this.client_secret = client_secret;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
