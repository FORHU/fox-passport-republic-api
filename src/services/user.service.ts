import { ObjectId } from "mongodb";

import { TUser, user_status } from "../models/user.model";
import UserRepo from "../repositories/user.repository";
import { LookupFields } from "../types/common";
import { hashSearch } from "../utils/helpers";
import RedisUtil from "../utils/redis.util";
import StripeAccountSvc from "./stripe-account.service";

const PREFIX = "user";

export default class UserSvc {
  static async createUser(data: any) {
    try {
      return await UserRepo.createUser(data);
    } catch (error) {
      throw new Error(`Failed to create user: ${error}`);
    }
  }

  static async countUsers(query: any) {
    return UserRepo.countUsers(query);
  }

  static async handleGetUsers(query: any, limit: number, offset: number) {
    return UserRepo.handleGetUsers({ query, limit, offset });
  }

  static async updateUser(query: any, updatedUserData: TUser) {
    return UserRepo.updateUser(query, updatedUserData);
  }

  static async getUser(query: any, lookups?: LookupFields[]) {
    return UserRepo.getUser(query, lookups);
  }
  static async getUserInfo(query: any) {
    const lookups: LookupFields[] = [
      {
        collection_name: "files",
        field_name: "profile_picture",
        unwind: true,
      },
      {
        collection_name: "user_roles",
        field_name: "user_roles",
        unwind: true,
      },
      {
        collection_name: "organization_members",
        field_name: "organization_members",
        unwind: true,
      },
      {
        collection_name: "admin_members",
        field_name: "admin_member_role",
        unwind: true,
        add_fields: {
          assigned_roles: {
            $ifNull: [{ $arrayElemAt: ["$organization_members.assigned_roles", 0] }, { $ifNull: ["$admin_member_role.assigned_roles", null] }],
          },
        },
      },
      {
        collection_name: "stripe_account",
        field_name: "stripe_account",
        unwind: true,
      },
    ];

    let result = null;
    const hashUserInfo = hashSearch({ query, lookups, description: "getUserInfo" });
    const cacheUserInfo = await RedisUtil.getCache(hashUserInfo, PREFIX);

    if (!cacheUserInfo) {
      result = await UserRepo.getUser(query, lookups);
      await RedisUtil.saveCache({ key: hashUserInfo, data: JSON.stringify(result), prefix: PREFIX });
    } else {
      result = JSON.parse(cacheUserInfo);
    }

    return result;
  }

  static async deleteUser(_id: ObjectId, data: any, role?: string) {
    try {
      if (role === "VENUE_OWNER") {
        const existingTransaction = await UserRepo.getActiveTransactions({ _id: _id });

        if (existingTransaction.hasActiveTransactions) {
          throw new Error(existingTransaction.message);
        }
      }

      return await UserRepo.deleteUser(_id, data);
    } catch (error) {
      throw new Error(`Failed to delete user: ${error}`);
    }
  }

  static async getUsers(query: any) {
    return UserRepo.getUsers(query);
  }

  static async getOnboardingStatus(userId: string) {
    const user = await UserRepo.getUser({ _id: new ObjectId(userId) });
    if (!user) {
      return null;
    }
    const stripeAccount = await StripeAccountSvc.getAccount({ user: new ObjectId(userId) });
    return {
      user_id: userId,
      is_email_verified: user.status === user_status.ACTIVE,
      is_stripe_account_verified: stripeAccount?.status === "COMPLETED",
    };
  }
}
