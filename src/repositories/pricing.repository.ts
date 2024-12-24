import { ObjectId } from "mongodb";

import { TPrice, TUpdatePrice } from "../models/pricing.model";
import { getDB } from "../utils/mongo";

export default class PricingRepo {
  static collection() {
    return getDB().collection("pricing");
  }

  static async getPrice(query: any) {
    return await this.collection().findOne(query);
  }

  static async getPrices(query: any) {
    return await this.collection().find(query).toArray();
  }

  static async createPrice(data: TPrice) {
    return await this.collection().insertOne(data);
  }

  static async updatePrice(spaceId: ObjectId, updatedData: TUpdatePrice) {
    updatedData.updatedAt = new Date();
    return await this.collection().updateOne({ space_id: spaceId }, { $set: updatedData });
  }
}
