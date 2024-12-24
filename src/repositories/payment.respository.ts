import { MPayment, TPayment } from "../models/payment.model";
import { getDB } from "../utils/mongo";

export default class TodoRepo {
  static collection() {
    return getDB().collection("payments");
  }

  static async createPayment(data: TPayment) {
    return this.collection().insertOne(new MPayment(data));
  }

  static async getPayment(query: any) {
    return this.collection().findOne(query);
  }

  static async updatePayment(query: any, data: any) {
    return this.collection().updateOne(query, { $set: data });
  }
}
