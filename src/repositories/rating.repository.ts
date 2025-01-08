/* eslint-disable no-useless-catch */
import { Filter } from "mongodb";

import { TRating } from "../models/rating.model";
import { getDB } from "../utils/mongo";

export default class RatingRepo {
  static collection() {
    return getDB().collection("ratings");
  }

  static async upsertRating(query: any, data: TRating) {
    try {
      const collection = this.collection();
      return await collection.updateOne(query, { $set: data }, { upsert: true });
    } catch (error) {
      throw error;
    }
  }

  static async getRatingDetails(query: Filter<TRating>) {
    const collection = this.collection();
    return await collection.find(query).toArray();
  }

  static async getRating(query: Filter<TRating>) {
    try {
      const collection = this.collection();
      const result = await collection.aggregate([{ $match: query }, { $group: { _id: "$space", averageRating: { $avg: "$rating" } } }]).toArray();
      return result[0]?.averageRating ? parseFloat(result[0].averageRating.toFixed(2)) : 0;
    } catch (error) {
      throw error;
    }
  }

  static async getRatingAverage(query: any) {
    try {
      const collection = this.collection();
      const results = await collection
        .aggregate([{ $match: query }, { $group: { _id: "$space", totalRating: { $sum: "$rating" }, averageRating: { $avg: "$rating" } } }])
        .toArray();
      return results[0];
    } catch (error) {
      throw error;
    }
  }
}
