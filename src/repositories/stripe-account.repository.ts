import { MStripeAccount, TStripeAccount } from "../models/stripe-account.model";
import { getDB } from "../utils/mongo";
import RedisUtil from "../utils/redis.util";

const PREFIX_USER = "user";

export default class StripeAccountRepo {
  static collection() {
    return getDB().collection("stripe-account");
  }

  static getAccount(query: any) {
    return this.collection().findOne(query);
  }

  static getAccounts(query: any) {
    return this.collection().find(query).toArray();
  }

  static async createAccount(data: TStripeAccount) {
    return this.collection().insertOne(new MStripeAccount(data));
  }

  static async updateAccount(query: any, data: any) {
    await RedisUtil.invalidateByPrefix(PREFIX_USER);
    return this.collection().updateOne(query, { $set: data });
  }

  static async deleteAccount(query: any) {
    await RedisUtil.invalidateByPrefix(PREFIX_USER);
    return this.collection().deleteOne(query);
  }
}
