/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";

import { TOrganizationMember, TUpdateOrganizationMember } from "../models/organization-member.model";
import { getDB } from "../utils/mongo";

export default class OrganizationMemberRepo {
  static collection() {
    return getDB().collection("organization-members");
  }

  static async createTeamMember(data: TOrganizationMember) {
    try {
      const createdAt = new Date();
      const created_data = { ...data, createdAt };

      const result = await this.collection().insertOne(created_data);
      return result.insertedId;
    } catch (error) {
      throw error;
    }
  }

  static async getOrganizationMembers(query: any, skip?: number, limit?: number) {
    try {
      const pipeline = [];

      pipeline.push(
        {
          $lookup: {
            from: "users",
            localField: "invited_user_id",
            foreignField: "_id",
            as: "invited_user",
          },
        },
        {
          $unwind: {
            path: "$invited_user",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "files",
            localField: "invited_user.profile_picture",
            foreignField: "_id",
            as: "profile_image",
          },
        },
        {
          $unwind: {
            path: "$profile_image",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            "invited_user.profile_picture": { $ifNull: ["$profile_image.path", null] },
          },
        },
        {
          $lookup: {
            from: "venues",
            localField: "venues",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  name: 1,
                },
              },
            ],
            as: "venueLists",
          },
        },
        {
          $project: {
            _id: 1,
            invited_user: 1,
            is_owner: 1,
            organization: 1,
            venues: "$venueLists",
            assigned_roles: 1,
            inviter_user_id: 1,
            status: 1,
            all_venues: 1,
            suspension_time: { $ifNull: ["$suspension_time", null] },
            createdAt: 1,
            updatedAt: 1,
            deletedAt: 1,
            deletedBy: 1,
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      );

      if (Object.keys(query).length > 0) {
        pipeline.push({ $match: query });
      }
      if (skip !== undefined) {
        pipeline.push({ $skip: skip || 0 });
      }

      if (limit !== undefined) {
        pipeline.push({ $limit: limit || 1 });
      }

      const result = await this.collection().aggregate(pipeline).toArray();
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async countOrganizationMembers(query: any) {
    const pipeline = [];

    pipeline.push({
      $lookup: {
        from: "users",
        localField: "invited_user_id",
        foreignField: "_id",
        as: "invited_user",
      },
    });

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
  }

  static countOrganizationMember(query: any) {
    try {
      return this.collection().countDocuments(query);
    } catch (error) {
      throw error;
    }
  }

  static async getAllOrganizationMembers(query: any) {
    try {
      const result = await this.collection().find(query).toArray();
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getOrganization(query: any) {
    try {
      const result = await this.collection().findOne(query);
      return result;
    } catch (error) {
      throw error;
    }
  }

  static async updateOrganizationMembers(_id: ObjectId, data: TUpdateOrganizationMember) {
    try {
      const updatedAt = new Date();
      const updateObject = { $set: { ...data, updatedAt } };
      const result = await this.collection().updateOne({ _id: _id }, updateObject);
      return result.modifiedCount > 0;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  static async deleteOrganizationMember(_id: ObjectId, deletedBy: ObjectId) {
    try {
      const updateObject = {
        $set: {
          deletedAt: new Date(),
          deletedBy: deletedBy,
          status: "DELETED",
        },
      };
      const result = await this.collection().updateOne({ _id: _id }, updateObject);
      return result.modifiedCount > 0;
    } catch (error) {
      throw error;
    }
  }

  static async getOrganizationMemberById(invited_user_id: ObjectId) {
    try {
      const result = await this.collection().findOne({ invited_user_id });
      return result;
    } catch (error) {
      throw error;
    }
  }
}
