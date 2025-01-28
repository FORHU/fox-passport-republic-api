/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";

import { TFavorite, TUpdateFavorite } from "../models/favorite.model";
import { PaginationType } from "../types/common";
import { getDB } from "../utils/mongo";
import RedisUtil from "../utils/redis.util";

const PREFIX = "spaces";
const PREFIX_USER_LOGS = "user_logs";

export default class FavoriteRepo {
  static collection() {
    return getDB().collection("favorites");
  }

  static async getMarkedAsFavorites(query: any) {
    try {
      const collection = this.collection();
      const { user, space, favorite_folder } = query;

      const filter: any = {
        user: user,
      };
      if (space) {
        filter.space = new ObjectId(space);
      }
      if (favorite_folder) {
        filter.favorite_folder = new ObjectId(favorite_folder);
      }
      const favorites = await collection.find({ ...filter, marked_as_favorite: true }).toArray();
      return favorites;
    } catch (error) {
      throw error;
    }
  }

  static async createFavorite(data: TFavorite) {
    try {
      const collection = this.collection();
      const result = await collection.insertOne(data);
      await RedisUtil.invalidateByPrefix(PREFIX);
      await RedisUtil.invalidateByPrefix(PREFIX_USER_LOGS);
      return result.insertedId;
    } catch (error) {
      throw error;
    }
  }

  static async updateMarkedAsFavorite(data: TUpdateFavorite, id: ObjectId) {
    try {
      const collection = this.collection();
      const { marked_as_favorite } = data;

      const updateData = { $set: { marked_as_favorite, updatedAt: new Date() } };
      const result = await collection.updateOne({ _id: new ObjectId(id) }, updateData);
      await RedisUtil.invalidateByPrefix(PREFIX);
      await RedisUtil.invalidateByPrefix(PREFIX_USER_LOGS);
      return result.modifiedCount;
    } catch (error) {
      throw error;
    }
  }

  static async updateFavorite(data: TUpdateFavorite, id: string) {
    try {
      const collection = this.collection();
      const query = {
        _id: new ObjectId(id),
      };
      await RedisUtil.invalidateByPrefix(PREFIX);
      await RedisUtil.invalidateByPrefix(PREFIX_USER_LOGS);
      return collection.updateOne(query, {
        $set: data,
      });
    } catch (error) {
      throw error;
    }
  }

  static async getFavorites(pagination: PaginationType) {
    const { query, skip = 0, limit = 10 } = pagination;

    delete query.page;
    delete query.limit;
    const collection = this.collection();
    const aggregationPipeline = [
      {
        $match: { ...query, marked_as_favorite: true },
      },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "favorite-folder",
          localField: "favorite_folder",
          foreignField: "_id",
          as: "folderDetails",
        },
      },
      {
        $lookup: {
          from: "spaces",
          localField: "space",
          foreignField: "_id",
          as: "space",
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "space.0.space_photo",
          foreignField: "_id",
          as: "space_photo",
        },
      },
      {
        $lookup: {
          from: "pricing",
          localField: "space.0.pricing",
          foreignField: "_id",
          as: "pricing",
        },
      },
      {
        $lookup: {
          from: "venues",
          localField: "space.0.venue",
          foreignField: "_id",
          as: "venue",
        },
      },
      {
        $project: {
          _id: 1,
          marked_as_favorite: 1,
          favorite_folder: 1,
          space: {
            $mergeObjects: [
              { $arrayElemAt: ["$space", 0] },
              { space_photo: { $arrayElemAt: ["$space_photo", 0] } },
              { pricing: { $arrayElemAt: ["$pricing", 0] } },
              {
                venue: {
                  $cond: {
                    if: { $gt: [{ $size: "$venue" }, 0] },
                    then: {
                      _id: { $arrayElemAt: ["$venue._id", 0] },
                      name: { $arrayElemAt: ["$venue.name", 0] },
                      address: {
                        street: { $arrayElemAt: ["$venue.address.street", 0] },
                        city: { $arrayElemAt: ["$venue.address.city", 0] },
                        state: { $arrayElemAt: ["$venue.address.state", 0] },
                        country: { $arrayElemAt: ["$venue.address.country", 0] },
                        postal_code: { $arrayElemAt: ["$venue.address.postal_code", 0] },
                        coordinates: {
                          latitude: { $arrayElemAt: ["$venue.address.coordinates.latitude", 0] },
                          longitude: { $arrayElemAt: ["$venue.address.coordinates.longitude", 0] },
                        },
                      },
                    },
                    else: null,
                  },
                },
              },
            ],
          },
        },
      },
    ];

    const result = await collection.aggregate(aggregationPipeline).toArray();
    return result;
  }

  static async groupByFavoriteFolder(pagination: PaginationType) {
    const { query } = pagination;

    delete query.page;
    delete query.limit;

    const collection = this.collection();
    const aggregationPipeline = [
      {
        $match: { ...query, marked_as_favorite: true },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $lookup: {
          from: "favorite-folder",
          localField: "favorite_folder",
          foreignField: "_id",
          as: "folderDetails",
        },
      },
      {
        $lookup: {
          from: "spaces",
          localField: "space",
          foreignField: "_id",
          as: "space_details",
        },
      },
      {
        $lookup: {
          from: "files",
          localField: "space_details.space_photo",
          foreignField: "_id",
          as: "space_photo",
        },
      },
      {
        $unwind: {
          path: "$folderDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $unwind: {
          path: "$space_details",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: {
            favorite_folder: "$favorite_folder",
            folder_name: "$folderDetails.folder_name",
            createdAt: "$folderDetails.createdAt",
            updatedAt: "$folderDetails.updatedAt",
          },
          space_photos: { $push: "$space_photo" },
          favorites: {
            $push: {
              _id: "$_id",
              space: {
                _id: "$space_details._id",
                name: "$space_details.name",
                space_photo: "$space_photo",
              },
              user: "$user",
              marked_as_favorite: "$marked_as_favorite",
              createdAt: "$createdAt",
              updatedAt: "$updatedAt",
            },
          },
        },
      },
      {
        $sort: { "_id.createdAt": -1 },
      },
      {
        $project: {
          _id: 1,
          cover_photo: { $arrayElemAt: [{ $arrayElemAt: ["$space_photos", 0] }, 0] },
          favorites: 1,
        },
      },
    ];

    const result = await collection.aggregate(aggregationPipeline).toArray();
    return result;
  }

  static async getFolders() {
    try {
      const collection = this.collection();
      return collection.find({}).toArray();
    } catch (error) {
      throw error;
    }
  }

  static async deleteFavorite(query: any) {
    await RedisUtil.invalidateByPrefix(PREFIX);
    return this.collection().deleteMany(query);
  }
}
