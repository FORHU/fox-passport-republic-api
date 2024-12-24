import { MStripeAccount, TStripeAccount } from "../models/stripe-account.model";
import { getDB } from "../utils/mongo";

export default class TodoRepo {
  static collection() {
    return getDB().collection("stripe-account");
  }

  static getAccount(query: any) {
    return this.collection().findOne(query);
  }

  static async createAccount(data: TStripeAccount) {
    return this.collection().insertOne(new MStripeAccount(data));
  }

  static async updateAccount(query: any, data: any) {
    return this.collection().updateOne(query, { $set: data });
  }

  static async deleteAccount(query: any) {
    return this.collection().deleteOne(query);
  }
}
