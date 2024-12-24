import { ObjectId } from "mongodb";

import { TCancellationPolicy, TUpdateCancellationPolicy } from "../models/cancellation-policy.model";
import { getDB } from "../utils/mongo";

export default class CancellationPolicyRepo {
  static collection() {
    return getDB().collection("cancellation-policies");
  }

  static async createOrUpdateCancellationPolicy(data: TCancellationPolicy, _id?: ObjectId) {
    try {
      const updateData = { ...data, updatedAt: new Date() };
      delete updateData._id;

      const newOrExistingId = _id || new ObjectId();

      const result = await this.collection().updateOne({ _id: newOrExistingId }, { $set: updateData }, { upsert: true });
      return result.upsertedId || _id;
    } catch (error) {
      console.error("Error creating or updating cancellation policy:", error);
      throw error;
    }
  }

  static async getCancellationPolicy(query: any) {
    try {
      const cancellation_policy = await this.collection().find(query).toArray();
      return cancellation_policy;
    } catch (error) {
      throw error;
    }
  }

  static async updateCancellationPolicy(cancellationId: ObjectId, data: TUpdateCancellationPolicy) {
    try {
      const collection = this.collection();
      const result = await collection.updateOne({ _id: cancellationId }, { $set: { ...data, updatedAt: new Date() } });
      return result.modifiedCount > 0;
    } catch (error) {
      throw error;
    }
  }

  static async deleteCancellationPolicy(cancellationId: ObjectId, deletedBy: ObjectId) {
    try {
      const collection = this.collection();
      const result = await collection.updateOne({ _id: new ObjectId(cancellationId) }, { $set: { deletedAt: new Date(), deletedBy } });
      return result.modifiedCount > 0;
    } catch (error) {
      throw error;
    }
  }
}
