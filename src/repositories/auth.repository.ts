import { ObjectId } from "mongodb";

import { MAuth, TAuth, TUpdateAuth } from "../models/auth.model";
import { getDB } from "../utils/mongo";

export default class AuthRepo {
  static collection() {
    return getDB().collection("tokens");
  }

  static createToken(user: TAuth) {
    return this.collection().insertOne(new MAuth(user));
  }

  static async updateToken(query: any, updateData: Partial<TUpdateAuth>, options?: any) {
    const filter = query;
    const updateDocument = {
      $set: {
        ...updateData,
        updatedAt: new Date(),
      },
    };
    return await this.collection().updateOne(filter, updateDocument, options);
  }

  static async logoutUser(query: any) {
    const filter = query;
    return await this.collection().deleteOne(filter);
  }

  static async getAuthUsers(query: any) {
    return this.collection().findOne(query);
  }

  static async changePassword(userId: ObjectId) {
    const user = await this.collection().findOne(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user.password;
  }

  static async updateAuth(userId: ObjectId, updateData: Partial<TUpdateAuth>) {
    const filter = { user: userId };
    const updateDocument = {
      $set: {
        ...updateData,
        updatedAt: new Date(),
      },
    };
    return await this.collection().updateOne(filter, updateDocument);
  }
}
