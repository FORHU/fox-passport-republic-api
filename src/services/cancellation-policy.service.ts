import { ObjectId } from "mongodb";
import CancellationPolicyRepo from "../repositories/cancellation-policy.repository";
import { TCancellationPolicy, TUpdateCancellationPolicy } from "../models/cancellation-policy.model";
import { validateGetCancellationPolicySchema } from "../utils/cancellation-policy/validation";

export default class CancellationPolicySvc {
  static async createOrUpdateCancellationPolicy(data: TCancellationPolicy) {
    try {
      const [existingCancellationPolicy] = await CancellationPolicyRepo.getCancellationPolicy({ venue_id: data.venue_id });

      if (!existingCancellationPolicy) {
        data["createdAt"] = new Date();
      }

      const insertedId = await CancellationPolicyRepo.createOrUpdateCancellationPolicy(data, existingCancellationPolicy?._id);
      return insertedId;
    } catch (error) {
      return error;
    }
  }

  static async getCancellationPolicy(query: any) {
    try {
      const { error } = validateGetCancellationPolicySchema(query);
      if (error) {
        throw error;
      }

      const { venue_id } = query;
      if (venue_id) {
        query.venue_id = new ObjectId(venue_id);
      }

      query["deletedAt"] = { $eq: null };

      return await CancellationPolicyRepo.getCancellationPolicy(query);
    } catch (error) {
      throw error;
    }
  }

  static async updateCancellationPolicy(_id: ObjectId, data: TUpdateCancellationPolicy) {
    try {
      const result = await CancellationPolicyRepo.updateCancellationPolicy(_id, data);
      return result;
    } catch (error) {
      return error;
    }
  }

  static async deleteCancellationPolicy(cancellationId: ObjectId, deletedBy: ObjectId) {
    try {
      const result = await CancellationPolicyRepo.deleteCancellationPolicy(cancellationId, deletedBy);
      return result;
    } catch (error) {
      return error;
    }
  }
}
