import { ObjectId } from "mongodb";

import { MAdminMembers, TAdminMembers } from "../models/admin-members.model";
import { getDB } from "../utils/mongo";
import RedisUtil from "../utils/redis.util";

const PREFIX = "ADMIN_MEMBERS";

export default class AdminMembersRepo {
  static collection() {
    return getDB().collection("admin-members");
  }

  static async createAdminMember(data: TAdminMembers) {
    return await this.collection().insertOne(new MAdminMembers(data));
  }

  static async getAdminMembers(query: any, skip: number, limit: number) {
    const data = await this.collection()
      .aggregate([
        {
          $lookup: {
            from: "users",
            localField: "invited_user",
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
            from: "venues",
            localField: "venues",
            foreignField: "_id",
            as: "venues",
          },
        },
        { $match: query },
        {
          $project: {
            _id: 1,
            admin: 1,
            venues: 1,
            user: 1,
            role: 1,
            acl: 1,
            status: 1,
            createdAt: 1,
            updatedAt: 1,
            deletedAt: 1,
            deletedBy: 1,
            invited_user: 1,
            suspension_time: 1,
            assigned_roles: {
              $cond: {
                if: { $isArray: "$assigned_roles" },
                then: "$assigned_roles",
                else: {
                  $cond: {
                    if: { $ne: ["$assigned_roles", null] },
                    then: ["$assigned_roles"],
                    else: [],
                  },
                },
              },
            },
          },
        },
        { $skip: skip },
        { $limit: limit },
      ])
      .toArray();

    return data;
  }

  static async getAdminMember(query: any) {
    return this.collection().findOne(query);
  }

  static async countAdminMembers(query: any) {
    const count = await this.collection()
      .aggregate([
        {
          $lookup: {
            from: "users",
            localField: "invited_user",
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
        { $match: query },
        {
          $count: "total_items",
        },
      ])
      .toArray();

    return count.length > 0 ? count[0].total_items : 0;
  }

  static async getAllAdminMembers(query: any) {
    return await this.collection().find(query).toArray();
  }

  static async updateAdminMemberById(_id: ObjectId, updatedData: Partial<TAdminMembers>) {
    await RedisUtil.invalidateByPrefix(PREFIX);
    return await this.collection().updateOne({ _id }, { $set: updatedData });
  }

  static async deleteAdminMemberById(_id: ObjectId, updatedData: Partial<TAdminMembers>) {
    await RedisUtil.invalidateByPrefix(PREFIX);
    return await this.collection().updateOne({ _id }, { $set: updatedData });
  }
}
