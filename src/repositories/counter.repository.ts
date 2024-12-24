/* eslint-disable no-useless-catch */
import { TCounter } from "../models/counter.model";
import { getDB } from "../utils/mongo";

export default class CounterRepo {
  static collection() {
    return getDB().collection("counter");
  }

  static async createOrUpdateCounter(data: TCounter) {
    try {
      const collection = this.collection();
      const filter = { type: data.type };
      const update = { $set: { count: data.count } };
      const options = { upsert: true, returnDocument: "after" };

      const result = await collection.updateOne(filter, update, options);
      if (result.upsertedCount > 0) {
        return result;
      }
    } catch (error) {
      throw error;
    }
  }

  static async getCounterByType(type: any) {
    try {
      const collection = this.collection();
      const counter = await collection.findOne(type);
      return counter;
    } catch (error) {
      throw error;
    }
  }
}
