/* eslint-disable no-unused-vars */
/* eslint-disable no-useless-catch */
import { ObjectId } from "mongodb";

import { MUser, TUser, user_role } from "../models/user.model";
import { LookupFields } from "../types/common";
import { lookupMap } from "../utils/lookup";
import { getDB } from "../utils/mongo";
import RedisUtil from "../utils/redis.util";

const PREFIX = "user";

export default class UserRepo {
  static collection() {
    return getDB().collection("users");
  }

  static async createUser(user: TUser) {
    const userInstance = new MUser(user);
    await userInstance.save();
    await this.collection().insertOne(userInstance);
    await RedisUtil.invalidateByPrefix(PREFIX);
    return userInstance;
  }

  static async countUsers(query: any) {
    return this.collection().countDocuments(query);
  }

  static async handleGetUsers({ query, limit, offset }: { query: any; limit: number; offset: number }) {
    return await this.collection().find(query).limit(limit).skip(offset).toArray();
  }

  static async getUser(query: any, lookupsFields?: LookupFields[]) {
    try {
      const pipeline: any[] = [{ $match: query }];
      if (lookupsFields && lookupsFields.length) {
        lookupsFields.forEach(({ collection_name, field_name, unwind, add_fields }) => {
          const lookupFunction = lookupMap[collection_name];
          if (lookupFunction) {
            const lookupConfig = lookupFunction(field_name);
            pipeline.push({
              $lookup: lookupConfig.lookup,
            });

            if (unwind) {
              pipeline.push({
                $unwind: {
                  path: `$${lookupConfig.lookup.as}`,
                  preserveNullAndEmptyArrays: true,
                },
              });

              if (add_fields) {
                pipeline.push({ $addFields: add_fields });
              } else if (lookupConfig.addFields) {
                pipeline.push({ $addFields: lookupConfig.addFields });
              }
            }
          }
        });
      }
      pipeline.push({
        $project: {
          _id: 1,
          first_name: 1,
          last_name: 1,
          phone_number: 1,
          date_of_birth: 1,
          profile_picture: 1,
          origin: 1,
          company_name: 1,
          country: 1,
          zip_code: 1,
          email: 1,
          username: 1,
          password: 1,
          role: 1,
          status: 1,
          otp: 1,
          organization: 1,
          social_link: 1,
          postal: 1,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: 1,
          deletedBy: 1,
          venue_name: 1,
          assigned_roles: 1,
          tenant: 1,
          user_roles: 1,
          fully_verified: 1,
          stripe_account: "$stripe_account.status",
          room_id: 1,
        },
      });
      const [userData] = await this.collection().aggregate(pipeline).toArray();

      return userData;
    } catch (error) {
      console.error("Error fetching user data:", error);
      throw error;
    }
  }

  static async updateManyUsers(query: any, data: any) {
    try {
      const result = await this.collection().updateMany(query, { $set: data });
      await RedisUtil.invalidateByPrefix(PREFIX);
      return result.modifiedCount > 0;
    } catch (error) {
      throw error;
    }
  }

  static async updateUser(query: any, updatedUserData: any) {
    try {
      updatedUserData.updatedAt = new Date();

      const result = await this.collection().updateOne(query, { $set: updatedUserData });
      await RedisUtil.invalidateByPrefix(PREFIX);
      if (result.modifiedCount === 1) {
        return result;
      } else {
        return false;
      }
    } catch (error) {
      throw error;
    }
  }

  static async deleteUser(_id: ObjectId, data: any) {
    try {
      const result = await this.collection().updateOne(
        { _id: _id },
        {
          $set: data,
        },
      );
      await RedisUtil.invalidateByPrefix(PREFIX);
      if (result.modifiedCount === 1) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      throw new Error(`Failed to soft delete user: ${error}`);
    }
  }

  static async passwordReset(user_id: ObjectId) {
    try {
      const updatedUserData = {
        updatedAt: new Date(),
      };
      const result = await this.collection().updateOne({ _id: user_id }, { $set: updatedUserData });
      return result.modifiedCount > 0;
    } catch (error) {
      throw error;
    }
  }

  static async newPasswordReset(hashedNewPassword: string, email: string) {
    try {
      const query = { email: email };
      const updatedUserData = {
        password: hashedNewPassword,
        updatedAt: new Date(),
      };

      const result = await this.collection().updateOne(query, { $set: updatedUserData });
      return result.modifiedCount > 0;
    } catch (error) {
      console.error("Error resetting password:", error);
      throw error;
    }
  }

  static async getUsers(query: any, offset?: number, limit?: number) {
    try {
      const pipeline: any[] = [
        {
          $lookup: {
            from: "stripe-account",
            localField: "_id",
            foreignField: "user",
            as: "stripe_account",
          },
        },
        {
          $unwind: {
            path: "$stripe_account",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $match: query },
        {
          $project: {
            _id: 1,
            first_name: 1,
            last_name: 1,
            phone_number: 1,
            date_of_birth: 1,
            profile_picture: 1,
            origin: 1,
            company_name: 1,
            country: 1,
            zip_code: 1,
            email: 1,
            username: 1,
            password: 1,
            role: 1,
            status: 1,
            organization: 1,
            social_link: 1,
            postal: 1,
            createdAt: 1,
            updatedAt: 1,
            deletedAt: 1,
            deletedBy: 1,
            venue_name: 1,
            fully_verified: 1,
            stripe_account: "$stripe_account.status",
            room_id: 1,
          },
        },
      ];

      if (offset) {
        pipeline.push({ $skip: offset });
      }

      if (limit) {
        pipeline.push({ $limit: limit });
      }

      const users = await this.collection().aggregate(pipeline).toArray();

      return users;
    } catch (error) {
      console.error("Error fetching users:", error);
      throw error;
    }
  }

  static async countUser(query: any) {
    try {
      const count = await this.collection().countDocuments(query);
      return count;
    } catch (error) {
      console.error("Error counting users:", error);
      throw error;
    }
  }

  static async handleGetUser({ query, limit, offset }: { query: any; limit: number; offset: number }) {
    return await this.collection().find(query).limit(limit).skip(offset).toArray();
  }

  static async handleGetUsersV2(query: any) {
    return await this.collection().find(query).toArray();
  }

  static async getActiveTransactions(query: any) {
    try {
      const excludedStatuses = [
        "ARCHIVED",
        "CANCELLED",
        "DECLINED",
        "HAPPENED",
        "BOOKING_REQUEST_DECLINED",
        "BOOKING_REQUEST_WITHDRAWN",
        "PAYMENT_FAILED",
        "COMMISION_DUE",
      ];

      const pipeline = [
        { $match: query },
        {
          $project: {
            _id: 1,
          },
        },
        {
          $lookup: {
            from: "venues",
            localField: "_id",
            foreignField: "user",
            pipeline: [
              {
                $project: {
                  _id: 1,
                },
              },
            ],
            as: "venue",
          },
        },
        {
          $lookup: {
            from: "enquiries",
            localField: "venue._id",
            foreignField: "venue",
            pipeline: [
              {
                $match: {
                  status: {
                    $nin: excludedStatuses,
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  date: 1,
                  status: 1,
                },
              },
            ],
            as: "enquiries",
          },
        },
        {
          $lookup: {
            from: "bookings",
            localField: "enquiries._id",
            foreignField: "enquiry",
            pipeline: [
              {
                $match: {
                  event_type: "BOOKING",
                  status: {
                    $nin: excludedStatuses,
                  },
                },
              },
              { $project: { _id: 1, status: 1 } },
            ],
            as: "booking",
          },
        },
        {
          $addFields: {
            enquiryCount: { $size: "$enquiries" },
            bookingCount: { $size: "$booking" },
          },
        },
        {
          $project: {
            _id: 1,
            enquiries: 1,
            booking: 1,
            enquiryCount: 1,
            bookingCount: 1,
          },
        },
      ];

      const result = await this.collection().aggregate(pipeline).toArray();

      const totalEnquiries = result.reduce((sum, entry) => sum + entry.enquiryCount, 0);
      const totalBookings = result.reduce((sum, entry) => sum + entry.bookingCount, 0);

      const hasActiveTransactions = totalEnquiries > 0 || totalBookings > 0;

      const message = hasActiveTransactions
        ? `There are ${totalEnquiries} active enquiries,  and ${totalBookings} active bookings remaining.`
        : "No active transactions found.";

      return { hasActiveTransactions, message };
    } catch (error) {
      console.error("Error fetching active transactions:", error);
      throw error;
    }
  }

  static async createOrUpdateRoomId(_id: ObjectId, room_id: string) {
    await this.collection().updateOne({ _id }, { $set: { room_id } }, { upsert: true });
  }
}
