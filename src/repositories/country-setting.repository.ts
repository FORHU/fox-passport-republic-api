import { MCountrySetting, TCountrySetting } from "../models/country-setting.model";
import { getDB } from "../utils/mongo";

export default class TodoRepo {
  static collection() {
    return getDB().collection("country-settings");
  }

  static async createCountrySetting(data: TCountrySetting) {
    return this.collection().insertOne(new MCountrySetting(data));
  }

  static async updateCountrySetting(query: any, payload: any) {
    return this.collection().updateOne(query, {
      $set: payload,
    });
  }

  static async getCountrySetting(query: any) {
    const pipeline = [
      {
        $lookup: {
          from: "files",
          localField: "photo",
          foreignField: "_id",
          as: "photo",
        },
      },
      {
        $match: query,
      },
      {
        $project: {
          _id: 1,
          commission: 1,
          rebate: 1,
          country_name: 1,
          country_code: 1,
          currency: 1,
          currency_sign: 1,
          flag_url: 1,
          status: 1,
          photo: 1,
          cca2: 1,
          isDefault: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static async getListCountrySetting(query: any, page: number, limit: number) {
    const pipeline = [
      {
        $lookup: {
          from: "files",
          localField: "photo",
          foreignField: "_id",
          as: "photo",
        },
      },
      {
        $match: query,
      },
      {
        $project: {
          _id: 1,
          commission: 1,
          rebate: 1,
          country_name: 1,
          country_code: 1,
          currency: 1,
          currency_sign: 1,
          flag_url: 1,
          status: 1,
          photo: 1,
          cca2: 1,
          isDefault: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      {
        $skip: (page - 1) * limit,
      },
      {
        $limit: limit,
      },
    ];

    const result = await this.collection().aggregate(pipeline).toArray();
    return result;
  }

  static async countCountrySetting(query: any) {
    return this.collection().countDocuments(query);
  }

  static async deleteCountrySetting(query: any) {
    try {
      await this.collection().deleteOne(query);
      return Promise.resolve("Successfully deleted organization.");
    } catch (error) {
      return Promise.reject("Server internal error.");
    }
  }

  static async handeCountrySettingsPhotos(query?: any) {
    const pipeline = [
      { $match: query },
      { $project: { all_photos: { $concatArrays: ["$photo"] } } },
      { $unwind: "$all_photos" },
      { $group: { _id: null, usedFileIds: { $addToSet: "$all_photos" } } },
    ];
    return await this.collection().aggregate(pipeline).toArray();
  }
}
