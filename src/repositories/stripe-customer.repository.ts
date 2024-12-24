import { MStripeCustomer, TStripeCustomer } from "../models/stripe-customer.model";
import { getDB } from "../utils/mongo";

export default class TodoRepo {
  static collection() {
    return getDB().collection("stripe-customer");
  }

  static getCustomer(query: any) {
    return this.collection().findOne(query);
  }

  static async createCustomer(data: TStripeCustomer) {
    return this.collection().insertOne(new MStripeCustomer(data));
  }

  static async createOrUpdateCustomer(query: any, data: any) {
    const currentDate = new Date();

    return this.collection().updateOne(
      query,
      {
        $set: {
          ...data,
          updatedAt: currentDate,
        },
        $setOnInsert: {
          createdAt: currentDate,
        },
      },
      { upsert: true },
    );
  }
}
