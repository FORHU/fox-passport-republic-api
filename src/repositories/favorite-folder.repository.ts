import { ObjectId } from "mongodb";

import { TFavoriteFolder, TUpdateFavoriteFolder } from "../models/favorite-folder.model";
import { getDB } from "../utils/mongo";

export default class FavoriteFolderRepo {
  static collection() {
    return getDB().collection("favorite-folder");
  }

  static async createFavoriteFolder(data: TFavoriteFolder) {
    try {
      const collection = this.collection();
      const result = await collection.insertOne(data);
      return result.insertedId;
    } catch (error) {
      throw error;
    }
  }

  static async updateFavoriteFolder(data: TUpdateFavoriteFolder, id: ObjectId) {
    try {
      const collection = this.collection();

      const updateData = { $set: { ...data, updatedAt: new Date() } };
      const result = await collection.updateOne({ _id: new ObjectId(id) }, updateData);

      return result.modifiedCount;
    } catch (error) {
      throw error;
    }
  }
  static async deleteFavoriteFolder(query: any) {
    try {
      const collection = this.collection();

      const result = await collection.deleteOne(query);

      return result;
    } catch (error) {
      throw error;
    }
  }

  static async getFavoriteFolder(query: any) {
    const collection = this.collection();
    const aggregationPipeline = [
      {
        $match: { ...query },
      },
    ];

    const result = await collection.aggregate(aggregationPipeline).toArray();
    return result;
  }
}
