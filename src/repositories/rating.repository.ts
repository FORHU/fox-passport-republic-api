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
      const now = new Date();

      return await collection.updateOne(
        query,
        {
          $set: { ...data, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
    } catch (error) {
      throw error;
    }
  }

  static async getOverallRatings(query: Filter<TRating>) {
    try {
      const collection = this.collection();
      const result = await collection
        .aggregate([
          { $match: query },
          {
            $group: {
              _id: "$space",
              totalRatings: { $sum: "$rating" },
              averageRating: { $avg: "$rating" },
              totalReviews: { $sum: 1 },
              details: { $push: "$$ROOT" },
            },
          },
        ])
        .toArray();

      return result.map((item) => ({
        space: item._id,
        averageRating: parseFloat(item.averageRating.toFixed(2)),
        totalRatings: parseFloat(item.totalRatings.toFixed(2)),
        totalReviews: parseFloat(item.totalReviews.toFixed(2)),
        details: item.details,
      }));
    } catch (error) {
      throw error;
    }
  }
}
