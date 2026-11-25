import { Request, Response } from "express";
import Joi from "joi";
import { sendServerError } from "../../utils/errors";
import { sendValidationError, VALIDATE_ALL } from "../../utils/validation";
import { announceAdminQueueChanged } from "../../infrastructure/socket/invalidate";
import SpecialtySuggestionSvc from "./specialty-suggestion.service";

const SUGGEST_BODY = Joi.object({
  name: Joi.string().trim().min(2).max(60).required(),
});

const LIST_QUERY = Joi.object({
  status: Joi.string()
    .valid("pending", "approved", "rejected")
    .default("pending"),
});

const ID_PARAMS = Joi.object({ id: Joi.string().uuid().required() });

const APPROVE_BODY = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  // The main category it goes under (api#503); none keeps it ungrouped.
  group: Joi.string()
    .trim()
    .max(60)
    .pattern(/^[a-z0-9_]+$/)
    .optional(),
});

const actorOf = (req: Request) => ({
  userId: req.user!.userId,
  email: req.user!.email,
});

/** Provider specialty suggestions (api#440). */
export default class SpecialtySuggestionController {
  // POST /categories/provider-specialties/suggestions (any signed-in person)
  static async suggest(req: Request, res: Response) {
    try {
      const { error, value } = SUGGEST_BODY.validate(req.body, VALIDATE_ALL);
      if (error) return sendValidationError(res, error, { success: false });

      const { suggestion, created } = await SpecialtySuggestionSvc.suggest(
        value.name,
        req.user!.userId,
      );
      if (created) announceAdminQueueChanged();
      return res.status(created ? 201 : 200).json({
        success: true,
        message: created
          ? "Thanks! Your suggestion was sent for review"
          : "This specialty is already waiting for review",
        data: suggestion,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  // GET /categories/provider-specialties/suggestions?status=pending
  static async list(req: Request, res: Response) {
    try {
      const { error, value } = LIST_QUERY.validate(req.query, VALIDATE_ALL);
      if (error) return sendValidationError(res, error, { success: false });

      const suggestions = await SpecialtySuggestionSvc.list(value.status);
      return res.status(200).json({
        success: true,
        count: suggestions.length,
        data: suggestions,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  // POST /categories/provider-specialties/suggestions/:id/approve
  static async approve(req: Request, res: Response) {
    try {
      const params = ID_PARAMS.validate(req.params);
      if (params.error) {
        return sendValidationError(res, params.error, { success: false });
      }
      const body = APPROVE_BODY.validate(req.body ?? {}, VALIDATE_ALL);
      if (body.error) {
        return sendValidationError(res, body.error, { success: false });
      }

      const category = await SpecialtySuggestionSvc.approve(
        params.value.id,
        actorOf(req),
        body.value.name,
        body.value.group,
      );
      announceAdminQueueChanged();
      return res.status(200).json({
        success: true,
        message: "Specialty added to the catalog",
        data: category,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  // POST /categories/provider-specialties/suggestions/:id/reject
  static async reject(req: Request, res: Response) {
    try {
      const params = ID_PARAMS.validate(req.params);
      if (params.error) {
        return sendValidationError(res, params.error, { success: false });
      }

      const suggestion = await SpecialtySuggestionSvc.reject(
        params.value.id,
        actorOf(req),
      );
      announceAdminQueueChanged();
      return res.status(200).json({
        success: true,
        message: "Suggestion rejected",
        data: suggestion,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}
