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
          stripe_account: "$stripe_account.status",
        },
      });
      const [userData] = await this.collection().aggregate(pipeline).toArray();

      return userData;
    } catch (error) {
      console.error("Error fetching user data:", error);
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

  static async getUsers(query: any) {
    try {
      const users = await this.collection()
        .aggregate([
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
              stripe_account: "$stripe_account.status",
            },
          },
          { $match: query },
        ])
        .toArray();

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
}
