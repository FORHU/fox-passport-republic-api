/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";
import { getDB } from "../utils/mongo";
import RedisUtil from "../utils/redis.util";

const VENUE_PREFIX = "venues";
const SPACE_PREFIX = "spaces";
const PREFIX_USER_LOGS = "user_logs";

export default class AdminRepo {
  //VENUES

  static venuesCollection() {
    return getDB().collection("venues");
  }

  static async getVenues(query: any) {
    try {
      return await this.venuesCollection().find(query).toArray();
    } catch (error) {
      throw error;
    }
  }

  static async updateVenue(_id: ObjectId, status: string) {
    try {
      const result = await this.venuesCollection().updateOne({ _id: new ObjectId(_id) }, { $set: { status: status, updatedAt: new Date() } });
      await RedisUtil.invalidateByPrefix(VENUE_PREFIX);
      await RedisUtil.invalidateByPrefix(SPACE_PREFIX);
      await RedisUtil.invalidateByPrefix(PREFIX_USER_LOGS);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getAllVenues(query: any, pageNumber: number, limitNumber: number) {
    try {
      const pipeline = [];

      pipeline.push(
        {
          $lookup: {
            from: "spaces",
            localField: "_id",
            foreignField: "venue",
            as: "spaces",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "spaces.venue_photo",
            foreignField: "_id",
            as: "venue_photos",
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "spaces.space_photo",
            foreignField: "_id",
            as: "space_photos",
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
      );

      pipeline.push(
        {
          $unwind: {
            path: "$venue_photos",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $sort: {
            "venue_photos.createdAt": 1,
          },
        },
        {
          $unwind: {
            path: "$space_photos",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $sort: {
            "space_photos.createdAt": 1,
          },
        },
        {
          $group: {
            _id: "$_id",
            venue_photos: { $push: "$venue_photos" },
            space_photos: { $push: "$space_photos" },
            name: { $first: "$name" },
            representation: { $first: "$representation" },
            description: { $first: "$description" },
            address: { $first: "$address" },
            keywords: { $first: "$matched_keywords" },
            status: { $first: "$status" },
            cancellation_policy: { $first: "$cancellation_policy" },
            foods_and_beverages: { $first: "$foods_and_beverages" },
            venue_details: { $first: "$venue_details" },
            user: { $first: "$user" },
            organization: { $first: "$organization" },
            age_restriction: { $first: "$age_restriction" },
            form_steps: { $first: "$form_steps" },
            commission: { $first: "$commission" },
            rebate: { $first: "$rebate" },
            createdAt: { $first: "$createdAt" },
            updatedAt: { $first: "$updatedAt" },
            deletedAt: { $first: "$deletedAt" },
            deletedBy: { $first: "$deletedBy" },
          },
        },
      );

      pipeline.push(
        {
          $match: query,
        },
        {
          $project: {
            _id: 1,
            name: 1,
            representation: 1,
            description: 1,
            address: 1,
            form_steps: 1,
            keywords: 1,
            cancellation_policy: 1,
            venue_photos: {
              $cond: { if: { $eq: ["$venue_photos", []] }, then: null, else: "$venue_photos" },
            },
            space_photos: {
              $cond: { if: { $eq: ["$space_photos", []] }, then: null, else: "$space_photos" },
            },
            foods_and_beverages: 1,
            venue_details: 1,
            organization: 1,
            age_restriction: 1,
            commission: 1,
            rebate: 1,
            createdAt: 1,
            updatedAt: 1,
            deletedAt: 1,
            deletedBy: 1,
            status: 1,
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (pageNumber - 1) * limitNumber },
        { $limit: limitNumber },
      );

      const [result, count] = await Promise.all([this.venuesCollection().aggregate(pipeline).toArray(), this.countAdminVenue(query)]);

      return {
        data: result,
        size: limitNumber,
        total_items: count["TOTAL"].count,
        current_page: pageNumber,
        total_pages: Math.ceil(count["TOTAL"].count / limitNumber),
        offset: (pageNumber - 1) * limitNumber,
      };
    } catch (error) {
      throw error;
    }
  }

  static async countAdminVenue(query = {}) {
    try {
      const countByStatusArray = await this.venuesCollection()
        .aggregate([{ $match: query }, { $group: { _id: "$status", count: { $sum: 1 } } }])
        .toArray();

      const totalCount = countByStatusArray.reduce((total, statusCount) => total + statusCount.count, 0);

      const count = countByStatusArray.reduce((acc, statusCount) => {
        acc[statusCount._id] = {
          status: statusCount._id,
          count: statusCount.count,
        };
        return acc;
      }, {});

      count["TOTAL"] = {
        status: "ALL",
        count: totalCount,
      };

      return count;
    } catch (error) {
      throw error;
    }
  }

  static async deleteVenue(query: any, updateData: any) {
    try {
      const result = await this.venuesCollection().updateOne(
        { _id: query },
        {
          $set: updateData,
        },
      );
      await RedisUtil.invalidateByPrefix(VENUE_PREFIX);
      await RedisUtil.invalidateByPrefix(SPACE_PREFIX);
      return result;
    } catch (error) {
      throw error;
    }
  }

  //SPACE

  static spacesCollection() {
    return getDB().collection("spaces");
  }

  static async getSpaces(query: any) {
    try {
      const pipeline = [
        {
          $match: query,
        },
        {
          $lookup: {
            from: "venues",
            localField: "venue",
            foreignField: "_id",
            as: "venueData",
          },
        },
        {
          $unwind: {
            path: "$venueData",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "venueData.user",
            foreignField: "_id",
            as: "userData",
          },
        },
        {
          $unwind: {
            path: "$userData",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            name: 1,
            type: 1,
            representation: 1,
            description: 1,
            venue: {
              $mergeObjects: ["$venueData", { user: "$userData" }],
            },
            space_photo: 1,
            venue_photo: 1,
            capacity_layout: 1,
            guest_capacity: 1,
            floor_plan: 1,
            features: 1,
            keywords: 1,
            pricing: 1,
            status: 1,
            form_steps: 1,
            userData: 1,
            booking: 1,
            createdAt: 1,
            updatedAt: 1,
            deletedAt: 1,
            deletedBy: 1,
          },
        },
      ];

      const data = await this.spacesCollection().aggregate(pipeline).toArray();
      return data;
    } catch (error) {
      throw error;
    }
  }

  static async updateSpace(query: any, data: any) {
    try {
      const result = await this.spacesCollection().updateMany(query, {
        $set: data,
      });
      await RedisUtil.invalidateByPrefix(VENUE_PREFIX);
      await RedisUtil.invalidateByPrefix(SPACE_PREFIX);
      await RedisUtil.invalidateByPrefix(PREFIX_USER_LOGS);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getAllSpaces(query: any, pageNumber: number, limitNumber: number) {
    try {
      const skip = (pageNumber - 1) * limitNumber;
      const data = await this.spacesCollection()
        .aggregate([
          {
            $lookup: {
              from: "venues",
              localField: "venue",
              foreignField: "_id",
              as: "venue",
            },
          },
          { $unwind: "$venue" },
          { $match: query },
          { $skip: skip },
          { $limit: limitNumber },
        ])
        .toArray();

      const total_documents = await this.spacesCollection()
        .aggregate([
          {
            $lookup: {
              from: "venues",
              localField: "venue",
              foreignField: "_id",
              as: "venue",
            },
          },
          { $unwind: "$venue" },
          { $match: query },
          { $count: "total" },
        ])
        .toArray();

      const limit = limitNumber;

      return {
        data,
        limit,
        total_documents: total_documents[0].total || 0,
        current_page: pageNumber,
        total_pages: Math.ceil(total_documents[0].total / limitNumber),
      };
    } catch (error) {
      throw error;
    }
  }

  static async countAdminSpace(query = {}) {
    try {
      const countByStatusArray = await this.spacesCollection()
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
            $unwind: "$venue",
          },
          {
            $match: query,
          },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ])
        .toArray();

      const totalCount = countByStatusArray.reduce((total, statusCount) => total + statusCount.count, 0);

      const count = countByStatusArray.reduce((acc, statusCount) => {
        acc[statusCount._id] = {
          status: statusCount._id,
          count: statusCount.count,
        };
        return acc;
      }, {});

      count["TOTAL"] = {
        status: "ALL",
        count: totalCount,
      };

      return count;
    } catch (error) {
      throw error;
    }
  }

  static async deleteSpace(query: any, updateData: any) {
    try {
      const result = await this.spacesCollection().updateMany(query, { $set: updateData });
      await RedisUtil.invalidateByPrefix(VENUE_PREFIX);
      await RedisUtil.invalidateByPrefix(SPACE_PREFIX);
      return result;
    } catch (error) {
      throw error;
    }
  }

  //ENQUIRIES

  static enquiriesCollection() {
    return getDB().collection("enquiries");
  }

  static async getEnquiries(query: any, pageNumber: number, limitNumber: number) {
    try {
      const skip = (pageNumber - 1) * limitNumber;
      const pipeline = [
        { $match: query },
        { $skip: skip },
        { $limit: limitNumber },
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
            from: "spaces",
            localField: "space",
            foreignField: "_id",
            as: "space",
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
          $project: {
            _id: 1,
            date: 1,
            type: 1,
            guests: 1,
            value: 1,
            status: 1,
            inbox: 1,
            createdAt: 1,
            venue: { $arrayElemAt: ["$venue", 0] },
            space: { $arrayElemAt: ["$space", 0] },
            user: { $arrayElemAt: ["$user", 0] },
          },
        },
      ];

      const data = await this.enquiriesCollection().aggregate(pipeline).toArray();
      const total_documents = await this.enquiriesCollection().countDocuments(query);
      const limit = limitNumber;

      return {
        data,
        limit,
        total_documents,
        current_page: pageNumber,
        total_pages: Math.ceil(total_documents / limitNumber),
      };
    } catch (error) {
      throw error;
    }
  }
}
