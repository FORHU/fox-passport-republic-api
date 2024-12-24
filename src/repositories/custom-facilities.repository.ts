import { ObjectId } from "mongodb";

import { TCustomFacilities, TUpdateCustomFacilities } from "../models/custom-facilities.model";
import { getDB } from "../utils/mongo";

export default class CustomFacilitiesRepo {
  static collection() {
    return getDB().collection("custom-facilities");
  }

  static async createCustomFacilities(data: TCustomFacilities) {
    try {
      const result = await this.collection().insertOne(data);
      return result.insertedId;
    } catch (error) {
      console.error("Error creating custom facilities:", error);
      throw error;
    }
  }

  static async updateCustomFacilities(data: TUpdateCustomFacilities) {
    try {
      const { space, custom_facilities, updatedAt } = data;
      const filter = { space: new ObjectId(space) };
      const update = {
        $set: {
          custom_facilities,
          updatedAt: updatedAt || new Date(),
        },
      };
      const result = await this.collection().updateOne(filter, update);
      return result.modifiedCount;
    } catch (error) {
      console.error("Error updating custom facilities:", error);
      throw error;
    }
  }
}
