import { Request, Response } from "express";
import Joi from "joi";
import PlatformFeeConfigSvc, {
  KNOWN_TRANSACTION_TYPES,
  KNOWN_CATEGORIES,
} from "./platform-fee-config.service";

const CREATE_BODY_SCHEMA = Joi.object({
  name: Joi.string().trim().required(),
  transactionType: Joi.string()
    .valid(...KNOWN_TRANSACTION_TYPES)
    .allow(null)
    .optional(),
  category: Joi.string()
    .valid(...KNOWN_CATEGORIES)
    .allow(null)
    .optional(),
  subcategory: Joi.string().trim().allow(null, "").optional(),
  percentage: Joi.number().min(0).max(100).allow(null).optional(),
  fixedAmount: Joi.number().min(0).allow(null).optional(),
  currency: Joi.string().trim().uppercase().length(3).optional(),
  priority: Joi.number().integer().optional(),
  effectiveFrom: Joi.date().optional(),
  effectiveUntil: Joi.date().allow(null).optional(),
})
  .or("percentage", "fixedAmount")
  .messages({
    "object.missing": "At least one of percentage or fixedAmount is required",
  });

const UPDATE_BODY_SCHEMA = Joi.object({
  name: Joi.string().trim().optional(),
  transactionType: Joi.string()
    .valid(...KNOWN_TRANSACTION_TYPES)
    .allow(null)
    .optional(),
  category: Joi.string()
    .valid(...KNOWN_CATEGORIES)
    .allow(null)
    .optional(),
  subcategory: Joi.string().trim().allow(null, "").optional(),
  percentage: Joi.number().min(0).max(100).allow(null).optional(),
  fixedAmount: Joi.number().min(0).allow(null).optional(),
  currency: Joi.string().trim().uppercase().length(3).optional(),
  priority: Joi.number().integer().optional(),
  active: Joi.boolean().optional(),
  effectiveFrom: Joi.date().optional(),
  effectiveUntil: Joi.date().allow(null).optional(),
}).min(1);

export default class PlatformFeeConfigCtrl {
  static async getAll(req: Request, res: Response) {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const rules = await PlatformFeeConfigSvc.getAll(includeInactive);
      return res.status(200).json({ success: true, data: rules });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const schema = Joi.object({ id: Joi.string().uuid().required() });
      const { error, value } = schema.validate(req.params);
      if (error) return res.status(400).json({ message: error.message });

      const rule = await PlatformFeeConfigSvc.getById(value.id);
      return res.status(200).json({ success: true, data: rule });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async preview(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        transactionType: Joi.string()
          .valid(...KNOWN_TRANSACTION_TYPES)
          .required(),
        category: Joi.string().optional(),
        subcategory: Joi.string().optional(),
      });
      const { error, value } = schema.validate(req.query);
      if (error) return res.status(400).json({ message: error.message });

      const rule = await PlatformFeeConfigSvc.preview(value);
      return res.status(200).json({ success: true, data: rule });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const { error, value } = CREATE_BODY_SCHEMA.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const rule = await PlatformFeeConfigSvc.create(value);
      return res.status(201).json({ success: true, data: rule });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const paramsSchema = Joi.object({ id: Joi.string().uuid().required() });
      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError)
        return res.status(400).json({ message: paramsError.message });

      const { error, value } = UPDATE_BODY_SCHEMA.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const rule = await PlatformFeeConfigSvc.update(params.id, value);
      return res.status(200).json({ success: true, data: rule });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const schema = Joi.object({ id: Joi.string().uuid().required() });
      const { error, value } = schema.validate(req.params);
      if (error) return res.status(400).json({ message: error.message });

      await PlatformFeeConfigSvc.remove(value.id);
      return res
        .status(200)
        .json({ success: true, message: "Fee rule deactivated" });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
