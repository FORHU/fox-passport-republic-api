import { Request, Response } from "express";
import { ObjectId } from "mongodb";

import CancellationPolicySvc from "../services/cancellation-policy.service";
import { validateCreateCancellationPolicySchema, validateUpdateCancellationPolicySchema } from "../utils/cancellation-policy/validation";
import { handleErrorResponse, handleResponse } from "../utils/reponse";

export default class CancellationPolicyCtrl {
  static async createCancellationPolicy(req: Request, res: Response) {
    try {
      const { venue_id, description, policy, allow_rescheduling } = req.body;

      const { error } = validateCreateCancellationPolicySchema(req.body);
      if (error) {
        handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      const data = {
        venue_id: new ObjectId(venue_id),
        description,
        policy,
        allow_rescheduling,
      };

      const result = await CancellationPolicySvc.createOrUpdateCancellationPolicy(data);
      return handleResponse(res, result, "CANCELLATION_POLICY_CREATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async getCancellationPolicy(req: Request, res: Response) {
    try {
      const result = await CancellationPolicySvc.getCancellationPolicy(req.query);

      return handleResponse(res, result, "CANCELLATION_POLICY_FETCHED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async updateCancellationPolicy(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { description, policy, allow_rescheduling } = req.body;

      const { error } = validateUpdateCancellationPolicySchema(req.body);
      if (error) {
        handleErrorResponse(res, error, { code: "VALIDATION_ERROR" });
      }
      const data = {
        description,
        policy,
        allow_rescheduling,
      };

      const result = await CancellationPolicySvc.updateCancellationPolicy(new ObjectId(id), data);
      if (!result) {
        return handleErrorResponse(res, {}, { code: "CANCELLATION_POLICY_NOT_FOUND" });
      }

      return handleResponse(res, result, "CANCELLATION_POLICY_UPDATED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }

  static async deleteCancellationPolicy(req: Request, res: Response) {
    try {
      const cancellationId = new ObjectId(req.params.id);
      const deletedBy = new ObjectId(req?.user?.id);

      const result = await CancellationPolicySvc.deleteCancellationPolicy(cancellationId, deletedBy);
      if (!result) {
        return handleErrorResponse(res, {}, { code: "CANCELLATION_POLICY_NOT_FOUND" });
      }

      return handleResponse(res, result, "CANCELLATION_POLICY_DELETED_SUCCESSFULLY");
    } catch (error) {
      return handleErrorResponse(res, error, { code: "INTERNAL_SERVER_ERROR" });
    }
  }
}
