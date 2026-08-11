import { Request, Response } from "express";
import Joi from "joi";
import CancellationPolicySvc from "../services/cancellation-policy.service";

export default class CancellationPolicyCtrl {
  static async getAll(req: Request, res: Response) {
    try {
      const policies = await CancellationPolicySvc.getAll();
      return res.status(200).json({ success: true, data: policies });
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

      const policy = await CancellationPolicySvc.getById(value.id);
      return res.status(200).json({ success: true, data: policy });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        name: Joi.string().trim().required(),
        description: Joi.string().trim().optional().allow(""),
        rules: Joi.array()
          .items(
            Joi.object({
              fromHours: Joi.number().integer().min(0).required(),
              toHours: Joi.number().integer().min(0).allow(null).optional(),
              refundPercent: Joi.number().integer().min(0).max(100).required(),
            }),
          )
          .min(1)
          .required(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const policy = await CancellationPolicySvc.create(value);
      return res.status(201).json({ success: true, data: policy });
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

      const bodySchema = Joi.object({
        name: Joi.string().trim().optional(),
        description: Joi.string().trim().optional().allow(""),
        rules: Joi.array()
          .items(
            Joi.object({
              fromHours: Joi.number().integer().min(0).required(),
              toHours: Joi.number().integer().min(0).allow(null).optional(),
              refundPercent: Joi.number().integer().min(0).max(100).required(),
            }),
          )
          .min(1)
          .optional(),
      });

      const { error, value } = bodySchema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const policy = await CancellationPolicySvc.update(params.id, value);
      return res.status(200).json({ success: true, data: policy });
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

      await CancellationPolicySvc.remove(value.id);
      return res
        .status(200)
        .json({ success: true, message: "Policy deactivated" });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}
