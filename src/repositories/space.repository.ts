/* eslint-disable no-useless-catch */
import { Filter } from "mongodb";

import { MSpace, TSpace } from "../models/space.model";
import { PaginationType } from "../types/common";
import { getDB } from "../utils/mongo";
import RedisUtil from "../utils/redis.util";

const PREFIX = "spaces";

export default class SpaceRepository {
  static collection() {
    return getDB().collection("spaces");
  }

  static async getSpace(query: any) {
    const pipeline = [];
    pipeline.push({ $match: query });
    pipeline.push({
      $lookup: {
        from: "keywords",
        localField: "keywords",
        foreignField: "_id",
        as: "keywords",
      },
    });
    const [result] = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static async getPaginatedSpaces({ query, skip, limit, user_id, mark_as_favorite, startDate, endDate }: PaginationType) {
    try {
      const pipeline = [];

      // 1. Initial lookups
      pipeline.push(
        {
          $lookup: {
            from: "venues",
            localField: "venue",
            foreignField: "_id",
            as: "venue",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "space_photo",
            foreignField: "_id",
            as: "space_photo",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "venue_photo",
            foreignField: "_id",
            as: "venue_photo",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "floor_plan",
            foreignField: "_id",
            as: "floor_plan",
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "capacity_layout",
            foreignField: "_id",
            as: "capacity_layout",
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "features",
            foreignField: "_id",
            as: "features",
          },
        },
        {
          $lookup: {
            from: "keywords",
            localField: "keywords",
            foreignField: "_id",
            as: "keywords",
          },
        },
        {
          $lookup: {
            from: "pricing",
            localField: "pricing",
            foreignField: "_id",
            as: "pricing",
          },
        },
        {
          $lookup: {
            from: "bookings",
            localField: "_id",
            foreignField: "space",
            as: "bookings",
          },
        },
        {
          $lookup: {
            from: "ratings",
            localField: "_id",
            foreignField: "space",
            as: "ratings",
          },
        },
      );

      pipeline.push(
        {
          $unwind: {
            path: "$venue",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "cancellation-policies",
            localField: "venue.cancellation_policy",
            foreignField: "_id",
            as: "cancellation_policy",
          },
        },
        {
          $addFields: {
            "venue.cancellation_policy": {
              $arrayElemAt: ["$cancellation_policy", 0],
            },
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "venue.foods_and_beverages",
            foreignField: "_id",
            as: "foods_and_beverages",
          },
        },
        {
          $addFields: {
            venue: {
              $mergeObjects: ["$venue", { foods_and_beverages: "$foods_and_beverages" }],
            },
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "venue.venue_details",
            foreignField: "_id",
            as: "venue_details",
          },
        },
        {
          $addFields: {
            venue: {
              $mergeObjects: ["$venue", { venue_details: "$venue_details" }],
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $addFields: {
            "venue.user": {
              $mergeObjects: [{ $arrayElemAt: ["$user", 0] }],
            },
          },
        },
      );

      // 2. Filter by marked_as_favorite
      pipeline.push({
        $lookup: {
          from: "favorites",
          let: { spaceId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ["$space", "$$spaceId"] }, { $eq: ["$marked_as_favorite", true] }, { $eq: ["$user", user_id] }],
                },
              },
            },
          ],
          as: "marked_as_favorite",
        },
      });

      if (mark_as_favorite) {
        pipeline.push({
          $match: {
            marked_as_favorite: { $ne: [] },
          },
        });
      }

      // 3. Exclude spaces with bookings within the specified date range
      if (startDate && endDate) {
        pipeline.push({
          $match: {
            bookings: {
              $not: {
                $elemMatch: {
                  $and: [
                    {
                      $or: [{ start_date: { $lt: endDate, $gte: startDate } }, { end_date: { $gt: startDate, $lte: endDate } }],
                    },
                    {
                      $or: [{ deletedAt: { $ne: null } }, { status: { $ne: "CANCELLED" } }],
                    },
                  ],
                },
              },
            },
          },
        });
      }

      // pipeline.push(
      //   {
      //     $unwind: {
      //       path: "$space_photo",
      //       preserveNullAndEmptyArrays: true,
      //     },
      //   },
      //   {
      //     $sort: {
      //       "space_photo.createdAt": 1,
      //     },
      //   },
      // {
      //   $group: {
      //     _id: "$_id",
      //     space_photo: { $push: "$space_photo" },
      //     name: { $first: "$name" },
      //     type: { $first: "$type" },
      //     representation: { $first: "$representation" },
      //     description: { $first: "$description" },
      //     venue: { $first: "$venue" },
      //     venue_photo: { $first: "$venue_photo" },
      //     floor_plan: { $first: "$floor_plan" },
      //     capacity_layout: { $first: "$capacity_layout" },
      //     guest_capacity: { $first: "$guest_capacity" },
      //     marked_as_favorite: { $first: "$marked_as_favorite" },
      //     features: { $first: "$features" },
      //     keywords: { $first: "$keywords" },
      //     pricing: { $first: "$pricing" },
      //     status: { $first: "$status" },
      //     form_steps: { $first: "$form_steps" },
      //     createdAt: { $first: "$createdAt" },
      //     updatedAt: { $first: "$updatedAt" },
      //     deletedAt: { $first: "$deletedAt" },
      //     deletedBy: { $first: "$deletedBy" },
      //   },
      // },
      // {
      //   $unwind: {
      //     path: "$venue_photo",
      //     preserveNullAndEmptyArrays: true,
      //   },
      // },
      // {
      //   $sort: {
      //     "venue_photo.createdAt": 1,
      //   },
      // },
      // {
      //   $group: {
      //     _id: "$_id",
      //     space_photo: { $first: "$space_photo" },
      //     venue_photo: { $push: "$venue_photo" },
      //     name: { $first: "$name" },
      //     type: { $first: "$type" },
      //     representation: { $first: "$representation" },
      //     description: { $first: "$description" },
      //     venue: { $first: "$venue" },
      //     floor_plan: { $first: "$floor_plan" },
      //     capacity_layout: { $first: "$capacity_layout" },
      //     guest_capacity: { $first: "$guest_capacity" },
      //     marked_as_favorite: { $first: "$marked_as_favorite" },
      //     features: { $first: "$features" },
      //     keywords: { $first: "$keywords" },
      //     pricing: { $first: "$pricing" },
      //     status: { $first: "$status" },
      //     form_steps: { $first: "$form_steps" },
      //     createdAt: { $first: "$createdAt" },
      //     updatedAt: { $first: "$updatedAt" },
      //     deletedAt: { $first: "$deletedAt" },
      //     deletedBy: { $first: "$deletedBy" },
      //   },
      // },
      //);

      // 4. Additional query filters
      if (Object.keys(query).length > 0) {
        pipeline.push({ $match: query });
      }

      // 5. Final projection
      pipeline.push({
        $project: {
          _id: 1,
          name: 1,
          type: 1,
          representation: 1,
          description: 1,
          venue: {
            $mergeObjects: [
              "$venue",
              {
                user: {
                  first_name: "$venue.user.first_name",
                  last_name: "$venue.user.last_name",
                  email: "$venue.user.email",
                  phone_number: "$venue.user.phone_number",
                },
              },
            ],
          },
          venue_photo: 1,
          space_photo: 1,
          floor_plan: 1,
          capacity_layout: 1,
          guest_capacity: 1,
          marked_as_favorite: {
            $cond: {
              if: { $isArray: "$marked_as_favorite" },
              then: {
                _id: { $arrayElemAt: ["$marked_as_favorite._id", 0] },
                isFavorite: { $cond: { if: { $gt: [{ $size: "$marked_as_favorite" }, 0] }, then: true, else: false } },
              },
              else: {
                _id: null,
                isFavorite: false,
              },
            },
          },
          features: 1,
          keywords: 1,
          pricing: { $arrayElemAt: ["$pricing", 0] },
          rating: {
            totalRating: { $sum: "$ratings.rating" },
            averageRating: {
              $cond: {
                if: { $eq: [{ $size: "$ratings" }, 0] },
                then: 0,
                else: { $avg: "$ratings.rating" },
              },
            },
            totalReviews: { $size: "$ratings" },
          },
          status: 1,
          form_steps: 1,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: 1,
          deletedBy: 1,
        },
      });

      // 6. Sorting, skipping, and limiting
      pipeline.push({
        $addFields: {
          latestDate: { $max: ["$updatedAt", "$createdAt"] },
        },
      });

      pipeline.push({ $sort: { latestDate: -1 } });
      pipeline.push({ $skip: skip }, { $limit: limit });
      const result = await this.collection().aggregate(pipeline).toArray();
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getSpaceKeywords(pagination: PaginationType) {
    const { query, skip, limit } = pagination;

    const pipeline = [
      {
        $match: query,
      },
      {
        $lookup: {
          from: "keywords",
          localField: "keywords",
          foreignField: "_id",
          as: "keywords",
        },
      },
      { $skip: skip },
      { $limit: limit },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();

    return result;
  }

  static async countPaginatedSpaces({ query, user_id, mark_as_favorite, startDate, endDate }: PaginationType) {
    try {
      const pipeline = [];

      // 1. Initial lookups
      pipeline.push(
        {
          $lookup: {
            from: "keywords",
            localField: "keywords",
            foreignField: "_id",
            as: "keywords",
          },
        },
        {
          $lookup: {
            from: "venues",
            localField: "venue",
            foreignField: "_id",
            as: "venue",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "space_photo",
            foreignField: "_id",
            as: "space_photo",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "venue_photo",
            foreignField: "_id",
            as: "venue_photo",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "floor_plan",
            foreignField: "_id",
            as: "floor_plan",
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "capacity_layout",
            foreignField: "_id",
            as: "capacity_layout",
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "features",
            foreignField: "_id",
            as: "features",
          },
        },
        {
          $lookup: {
            from: "pricing",
            localField: "pricing",
            foreignField: "_id",
            as: "pricing",
          },
        },
        {
          $lookup: {
            from: "bookings",
            localField: "_id",
            foreignField: "space",
            as: "bookings",
          },
        },
      );

      pipeline.push(
        {
          $unwind: {
            path: "$venue",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "cancellation-policies",
            localField: "venue.cancellation_policy",
            foreignField: "_id",
            as: "cancellation_policy",
          },
        },
        {
          $addFields: {
            "venue.cancellation_policy": {
              $arrayElemAt: ["$cancellation_policy", 0],
            },
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "venue.foods_and_beverages",
            foreignField: "_id",
            as: "foods_and_beverages",
          },
        },
        {
          $addFields: {
            venue: {
              $mergeObjects: ["$venue", { foods_and_beverages: "$foods_and_beverages" }],
            },
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "venue.venue_details",
            foreignField: "_id",
            as: "venue_details",
          },
        },
        {
          $addFields: {
            venue: {
              $mergeObjects: ["$venue", { venue_details: "$venue_details" }],
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $addFields: {
            "venue.user": {
              $mergeObjects: [{ $arrayElemAt: ["$user", 0] }],
            },
          },
        },
      );

      // 2. Filter by marked_as_favorite
      if (mark_as_favorite !== undefined && mark_as_favorite && user_id) {
        pipeline.push({
          $lookup: {
            from: "favorites",
            let: { spaceId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$space", "$$spaceId"] }, { $eq: ["$user", user_id] }, { $eq: ["$marked_as_favorite", true] }],
                  },
                },
              },
            ],
            as: "marked_as_favorite",
          },
        });
        pipeline.push({
          $match: {
            marked_as_favorite: { $exists: true, $ne: [] },
          },
        });
      }

      if (startDate && endDate) {
        pipeline.push({
          $match: {
            bookings: {
              $not: {
                $elemMatch: {
                  $or: [{ start_date: { $lt: endDate, $gte: startDate } }, { end_date: { $gt: startDate, $lte: endDate } }],
                },
              },
            },
          },
        });
      }

      // 4. Additional query filters
      if (Object.keys(query).length > 0) {
        pipeline.push({ $match: query });
      }

      pipeline.push({
        $count: "total_count",
      });

      const result = await this.collection().aggregate(pipeline).toArray();
      if (result.length > 0 && result[0].total_count !== undefined) {
        return result[0].total_count;
      } else {
        return 0;
      }
    } catch (error) {
      return 0;
    }
  }

  static async countSpaces(query: any) {
    const count = await this.collection().countDocuments(query);
    return count;
  }

  static async createSpaces(data: TSpace) {
    await RedisUtil.invalidateByPrefix(PREFIX);
    return this.collection().insertOne(new MSpace(data));
  }

  static async updateSpaces(payload: Partial<TSpace>, query: any) {
    payload.updatedAt = new Date();
    const result = await this.collection().updateMany(query, {
      $set: payload,
    });
    await RedisUtil.invalidateByPrefix(PREFIX);
    return result;
  }

  static async getMultipleSpaces(query: any) {
    return await this.collection().find(query).toArray();
  }

  static async getMostPopularSpaces(query: any, skip: number, limit: number) {
    try {
      const page = (skip - 1) * limit;
      const pipeline = [];

      // 1. Initial lookups
      pipeline.push(
        {
          $lookup: {
            from: "venues",
            localField: "venue",
            foreignField: "_id",
            as: "venue",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "space_photo",
            foreignField: "_id",
            as: "space_photo",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "venue_photo",
            foreignField: "_id",
            as: "venue_photo",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "floor_plan",
            foreignField: "_id",
            as: "floor_plan",
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "capacity_layout",
            foreignField: "_id",
            as: "capacity_layout",
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "features",
            foreignField: "_id",
            as: "features",
          },
        },
        {
          $lookup: {
            from: "keywords",
            localField: "keywords",
            foreignField: "_id",
            as: "keywords",
          },
        },
        {
          $lookup: {
            from: "pricing",
            localField: "pricing",
            foreignField: "_id",
            as: "pricing",
          },
        },
        {
          $lookup: {
            from: "bookings",
            localField: "_id",
            foreignField: "space",
            as: "bookings",
          },
        },
      );

      pipeline.push(
        {
          $unwind: {
            path: "$venue",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "cancellation-policies",
            localField: "venue.cancellation_policy",
            foreignField: "_id",
            as: "cancellation_policy",
          },
        },
        {
          $addFields: {
            "venue.cancellation_policy": {
              $arrayElemAt: ["$cancellation_policy", 0],
            },
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "venue.foods_and_beverages",
            foreignField: "_id",
            as: "foods_and_beverages",
          },
        },
        {
          $addFields: {
            venue: {
              $mergeObjects: ["$venue", { foods_and_beverages: "$foods_and_beverages" }],
            },
          },
        },
        {
          $lookup: {
            from: "questions",
            localField: "venue.venue_details",
            foreignField: "_id",
            as: "venue_details",
          },
        },
        {
          $addFields: {
            venue: {
              $mergeObjects: ["$venue", { venue_details: "$venue_details" }],
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $addFields: {
            "venue.user": {
              $mergeObjects: [{ $arrayElemAt: ["$user", 0] }],
            },
          },
        },
      );
      pipeline.push(
        {
          $unwind: {
            path: "$space_photo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $sort: {
            "space_photo.createdAt": 1,
          },
        },
        {
          $group: {
            _id: "$_id",
            space_photo: { $push: "$space_photo" },
            name: { $first: "$name" },
            type: { $first: "$type" },
            representation: { $first: "$representation" },
            description: { $first: "$description" },
            venue: { $first: "$venue" },
            venue_photo: { $first: "$venue_photo" },
            floor_plan: { $first: "$floor_plan" },
            capacity_layout: { $first: "$capacity_layout" },
            guest_capacity: { $first: "$guest_capacity" },
            marked_as_favorite: { $first: "$marked_as_favorite" },
            features: { $first: "$features" },
            keywords: { $first: "$keywords" },
            pricing: { $first: "$pricing" },
            status: { $first: "$status" },
            form_steps: { $first: "$form_steps" },
            createdAt: { $first: "$createdAt" },
            updatedAt: { $first: "$updatedAt" },
            deletedAt: { $first: "$deletedAt" },
            deletedBy: { $first: "$deletedBy" },
          },
        },
        {
          $unwind: {
            path: "$venue_photo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $sort: {
            "venue_photo.createdAt": 1,
          },
        },
        {
          $group: {
            _id: "$_id",
            space_photo: { $first: "$space_photo" },
            venue_photo: { $push: "$venue_photo" },
            name: { $first: "$name" },
            type: { $first: "$type" },
            representation: { $first: "$representation" },
            description: { $first: "$description" },
            venue: { $first: "$venue" },
            floor_plan: { $first: "$floor_plan" },
            capacity_layout: { $first: "$capacity_layout" },
            guest_capacity: { $first: "$guest_capacity" },
            marked_as_favorite: { $first: "$marked_as_favorite" },
            features: { $first: "$features" },
            keywords: { $first: "$keywords" },
            pricing: { $first: "$pricing" },
            status: { $first: "$status" },
            form_steps: { $first: "$form_steps" },
            createdAt: { $first: "$createdAt" },
            updatedAt: { $first: "$updatedAt" },
            deletedAt: { $first: "$deletedAt" },
            deletedBy: { $first: "$deletedBy" },
          },
        },
      );

      if (Object.keys(query).length > 0) {
        pipeline.push({ $match: query });
      }

      pipeline.push({
        $project: {
          _id: 1,
          name: 1,
          type: 1,
          representation: 1,
          description: 1,
          venue: {
            $mergeObjects: [
              "$venue",
              {
                user: {
                  first_name: "$venue.user.first_name",
                  last_name: "$venue.user.last_name",
                  email: "$venue.user.email",
                  phone_number: "$venue.user.phone_number",
                },
              },
            ],
          },
          venue_photo: 1,
          space_photo: 1,
          floor_plan: 1,
          capacity_layout: 1,
          guest_capacity: 1,
          marked_as_favorite: {
            $cond: {
              if: { $isArray: "$marked_as_favorite" },
              then: {
                _id: { $arrayElemAt: ["$marked_as_favorite._id", 0] },
                isFavorite: { $cond: { if: { $gt: [{ $size: "$marked_as_favorite" }, 0] }, then: true, else: false } },
              },
              else: {
                _id: null,
                isFavorite: false,
              },
            },
          },
          features: 1,
          keywords: 1,
          pricing: { $arrayElemAt: ["$pricing", 0] },
          status: 1,
          form_steps: 1,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: 1,
          deletedBy: 1,
          isMostPopular: 1,
        },
      });

      pipeline.push({ $skip: page }, { $limit: limit });

      const result = await this.collection().aggregate(pipeline).toArray();
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getSpaceNameIdAndStatus(query: any) {
    return await this.collection()
      .aggregate([
        {
          $lookup: {
            from: "venues",
            localField: "venue",
            foreignField: "_id",
            as: "venue",
          },
        },
        {
          $unwind: {
            path: "$venue",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
          },
        },
        {
          $unwind: {
            path: "$user",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "space_photo",
            foreignField: "_id",
            as: "space_photo",
          },
        },
        {
          $unwind: {
            path: "$space_photo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: query,
        },
        {
          $sort: {
            "space_photo.createdAt": 1,
          },
        },
        {
          $group: {
            _id: "$_id",
            name: { $first: "$name" },
            user: { $first: "$user" },
            status: { $first: "$status" },
            space_photo: { $push: "$space_photo" },
            latestDate: {
              $max: {
                $ifNull: ["$updatedAt", "$createdAt"],
              },
            },
          },
        },
        {
          $sort: {
            latestDate: -1,
          },
        },
        {
          $project: {
            _id: 1,
            user: 1,
            name: 1,
            status: 1,
            space_photo: 1,
          },
        },
      ])
      .toArray();
  }

  static async getSpaceList({ query, skip, limit }: PaginationType) {
    const page = (skip - 1) * limit;
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "files",
          localField: "space_photo",
          foreignField: "_id",
          as: "space_photo",
        },
      },
      {
        $unwind: {
          path: "$space_photo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$_id",
          name: { $first: "$name" },
          venue: { $first: "$venue" },
          status: { $first: "$status" },
          user: { $first: "$user" },
          space_photo: { $push: "$space_photo" },
          latestDate: {
            $max: {
              $ifNull: ["$updatedAt", "$createdAt"],
            },
          },
        },
      },
      {
        $sort: {
          latestDate: -1,
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          venue: 1,
          status: 1,
          user: 1,
          space_photo: 1,
        },
      },
      { $skip: page },
      { $limit: limit },
    ];

    return await this.collection().aggregate(pipeline).toArray();
  }

  static async deleteSpaces(query: Filter<TSpace>) {
    const result = await this.collection().deleteMany(query);
    await RedisUtil.invalidateByPrefix(PREFIX);
    return result;
  }

  static async getCoordinates(query: any) {
    const pipeline = [
      {
        $lookup: {
          from: "venues",
          localField: "venue",
          foreignField: "_id",
          as: "venue",
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "space_photo",
          foreignField: "_id",
          as: "space_photo",
        },
      },
      {
        $match: query,
      },
      {
        $project: {
          name: 1,
          venue: { $arrayElemAt: ["$venue", 0] },
          space_photo: {
            $ifNull: [{ $arrayElemAt: ["$space_photo.path", 0] }, null],
          },
        },
      },
      {
        $group: {
          _id: "$venue.address.country",
          coordinates: {
            $push: {
              lat: "$venue.address.coordinates.latitude",
              lng: "$venue.address.coordinates.longitude",
              photo_path: "$space_photo",
              title: "$venue.name",
            },
          },
        },
      },
      {
        $project: {
          country: "$_id",
          coordinates: 1,
          _id: 0,
        },
      },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }
}
