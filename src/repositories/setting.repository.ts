import { ObjectId } from "mongodb";
import { MSetting, TSetting } from "../models/setting.model";
import { getDB } from "../utils/mongo";

export default class SalesSettingRepo {
  static collection() {
    return getDB().collection("settings");
  }

  static async createOrUpdateSetting(data: TSetting) {
    const update = {
      $set: {
        ...data,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        deletedAt: null,
        deletedBy: null,
        createdAt: new Date(),
      },
    };

    return this.collection().updateOne({}, update, { upsert: true });
  }

  static async getSettings(query: TSetting) {
    return this.collection().find(query).toArray();
  }
}
