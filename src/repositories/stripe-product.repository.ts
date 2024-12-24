import { MStripeProduction, TStripeProduction } from "../models/stripe-product.model";
import { getDB } from "../utils/mongo";

export default class StripeProductRepo {
  static collection() {
    return getDB().collection("stripe-products");
  }

  static getProducts(query: any) {
    return this.collection().find(query).toArray();
  }

  static async createProduct(data: TStripeProduction) {
    return this.collection().insertOne(new MStripeProduction(data));
  }
}
