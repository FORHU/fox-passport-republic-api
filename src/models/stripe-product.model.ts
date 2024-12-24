import { ObjectId } from "mongodb";

export interface STRIPEPRICES {
  price_id: string;
  amount: number;
  currency: string;
  livemode: string;
  type: string;
  interval: string;
  active: string;
}

export type TStripeProduction = {
  _id?: ObjectId;
  product_name: string;
  product_id: string;
  prices: STRIPEPRICES[];
  status: string;
  tenant?: string;
  active?: Boolean;
  description: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TStripeProductionUpdateOptions = {
  _id?: ObjectId;
  product_name?: string;
  product_id?: string;
  prices: STRIPEPRICES[];
  status?: string;
  tenant?: string;
  active?: Boolean;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class MStripeProduction implements Partial<TStripeProduction> {
  _id?: ObjectId;
  product_name?: string;
  product_id?: string;
  prices: STRIPEPRICES[];
  active?: Boolean;
  status?: string;
  tenant?: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    {
      _id = new ObjectId(),
      product_name,
      product_id,
      active,
      status = "ACTIVE",
      tenant = "SG",
      description,
      prices,
      createdAt = new Date(),
      updatedAt,
    } = {} as TStripeProduction,
  ) {
    this._id = _id;
    this.product_name = product_name;
    this.product_id = product_id;
    this.status = status;
    this.active = active;
    this.prices = prices;
    this.tenant = tenant;
    this.description = description;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}
