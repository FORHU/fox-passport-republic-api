import { ObjectId } from "mongodb";

import { MKeyword, TKeyword } from "../models/keyword.model";
import { getDB } from "../utils/mongo";

export default class KeywordRepo {
  static collection() {
    return getDB().collection("keywords");
  }

  static async createKeywords(data: TKeyword[]) {
    return await this.collection().insertMany(data.map((keyword) => new MKeyword(keyword)));
  }

  static getKeywords(query: any, skip: number, limit: number) {
    return this.collection().find(query).skip(skip).limit(limit).toArray();
  }

  static countKeywords(query: any) {
    return this.collection().countDocuments(query);
  }

  static async updateKeywords(updateData: { keyword_id: ObjectId; payload: Partial<TKeyword> }[]) {
    const bulkOperations = updateData.map(({ keyword_id, payload }) => ({
      updateOne: {
        filter: { _id: keyword_id },
        update: { $set: payload },
      },
    }));
    return this.collection().bulkWrite(bulkOperations);
  }

  static async forceUpdateKeywords(data: { status: boolean }, query) {
    return await this.collection().updateMany(query, { $set: data });
  }

  static createOrUpdateKeywords(data: TKeyword[]) {
    const bulkOperations = data.map((keyword) => {
      const filter = { _id: keyword._id };
      const update = { $set: keyword };
      return {
        updateOne: {
          filter,
          update,
          upsert: true,
        },
      };
    });

    return this.collection().bulkWrite(bulkOperations);
  }

  static deleteKeywords(query: any) {
    return this.collection().deleteMany(query);
  }

  static async _createCreatemany(data: any) {
    const result = await this.collection().insertMany(data);
    const insertedIds = result.insertedIds;
    // eslint-disable-next-line no-unused-vars
    const keywordsIds = Object.entries(insertedIds).map(([key, value]) => new ObjectId(value));
    return keywordsIds;
  }

  static async getExistingKeywords(data: any) {
    const query = {
      keyword: data.keyword,
      categories: { $in: data.categories || [] },
      type: data.type,
    };

    return this.collection().findOne(query);
  }
}
