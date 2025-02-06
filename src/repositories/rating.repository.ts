/* eslint-disable no-useless-catch */
import { Filter } from "mongodb";

import { TRating, TUpdateRating } from "../models/rating.model";
import { getDB } from "../utils/mongo";

import RedisUtil from "../utils/redis.util";

const SPACE_PREFIX = "spaces";

export default class RatingRepo {
  static collection() {
    return getDB().collection("ratings");
  }

  static async countRatings(query: Filter<TRating>) {
    try {
      const collection = this.collection();

      const pipeline = [
        {
          $lookup: {
            from: "spaces",
            localField: "space",
            foreignField: "_id",
            as: "space",
          },
        },
        { $unwind: { path: "$space", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "venues",
            localField: "space.venue",
            foreignField: "_id",
            as: "space.venue",
          },
        },
        { $unwind: { path: "$space.venue", preserveNullAndEmptyArrays: true } },
        { $match: query },
        { $count: "totalCount" },
      ];

      const result = await collection.aggregate(pipeline).toArray();
      return result[0]?.totalCount || 0; // Get count or default to 0
    } catch (error) {
      throw error;
    }
  }

  static async getRatings(query: Filter<TRating>, limit: number, skip: number, sort?: any) {
    try {
      const collection = this.collection();
      const pipeline = [
        {
          $lookup: {
            from: "spaces",
            localField: "space",
            foreignField: "_id",
            as: "space",
          },
        },
        { $unwind: { path: "$space", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "venues",
            localField: "space.venue",
            foreignField: "_id",
            as: "space.venue",
          },
        },
        { $unwind: { path: "$space.venue", preserveNullAndEmptyArrays: true } },
        { $match: query },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: "files",
            localField: "user.profile_picture",
            foreignField: "_id",
            as: "profile_picture",
          },
        },
        { $unwind: { path: "$profile_picture", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            rating: 1,
            publicNote: 1,
            privateNote: 1,
            status: 1,
            user: {
              _id: "$user._id",
              first_name: "$user.first_name",
              last_name: "$user.last_name",
              email: "$user.email",
              profile_picture: {
                _id: "$profile_picture._id",
                path: "$profile_picture.path",
              },
            },
            space: {
              _id: "$space._id",
              name: "$space.name",
            },
            createdAt: 1,
            updatedAt: 1,
          },
        },
        { $sort: sort },
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
      await RedisUtil.invalidateByPrefix(SPACE_PREFIX);
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
        totalRating: parseFloat(item.totalRatings.toFixed(2)),
        totalReviews: parseFloat(item.totalReviews.toFixed(2)),
        details: item.details,
      }));
    } catch (error) {
      throw error;
    }
  }

  static async updateRating(query: Filter<TRating>, data: TUpdateRating) {
    const collection = this.collection();
    await RedisUtil.invalidateByPrefix(SPACE_PREFIX);
    return await collection.updateOne(query, { $set: data });
  }
}
