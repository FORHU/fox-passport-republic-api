/* eslint-disable no-useless-catch */
import { Filter } from "mongodb";

import { TRating } from "../models/rating.model";
import { getDB } from "../utils/mongo";

export default class RatingRepo {
  static collection() {
    return getDB().collection("ratings");
  }

  static async countRatings(query: Filter<TRating>) {
    try {
      const collection = this.collection();
      return await collection.countDocuments(query);
    } catch (error) {
      throw error;
    }
  }

  static async getRatings(query: Filter<TRating>, limit: number, skip: number) {
    try {
      const collection = this.collection();
      const pipeline = [
        { $match: query },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      ];
      return collection.aggregate(pipeline).toArray();
    } catch (error) {
      throw error;
    }
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
            $lookup: {
              from: "users",
              localField: "user",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: "$user" },
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

  static async updateRating(query: Filter<TRating>, data: TRating) {
    const collection = this.collection();
    return await collection.updateOne(query, { $set: data });
  }
}
