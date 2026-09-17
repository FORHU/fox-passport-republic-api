import { Request, Response } from "express";
import Joi from "joi";
import PromotionSvc from "./promotion.service";

const CREATE_BODY_SCHEMA = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().trim().allow(null, "").optional(),
  transactionType: Joi.string().trim().allow(null, "").optional(),
  category: Joi.string().trim().allow(null, "").optional(),
  subcategory: Joi.string().trim().allow(null, "").optional(),
  discountType: Joi.string().valid("percentage", "fixed").required(),
  discountValue: Joi.number().positive().required(),
  minSubtotal: Joi.number().min(0).allow(null).optional(),
  maxDiscount: Joi.number().min(0).allow(null).optional(),
  startDate: Joi.date().allow(null).optional(),
  endDate: Joi.date().allow(null).optional(),
  usageLimit: Joi.number().integer().min(1).allow(null).optional(),
  perUserLimit: Joi.number().integer().min(1).allow(null).optional(),
  autoApply: Joi.boolean().optional(),
});

const UPDATE_BODY_SCHEMA = Joi.object({
  name: Joi.string().trim().optional(),
  description: Joi.string().trim().allow(null, "").optional(),
  transactionType: Joi.string().trim().allow(null, "").optional(),
  category: Joi.string().trim().allow(null, "").optional(),
  subcategory: Joi.string().trim().allow(null, "").optional(),
  discountType: Joi.string().valid("percentage", "fixed").optional(),
  discountValue: Joi.number().positive().optional(),
  minSubtotal: Joi.number().min(0).allow(null).optional(),
  maxDiscount: Joi.number().min(0).allow(null).optional(),
  active: Joi.boolean().optional(),
  startDate: Joi.date().allow(null).optional(),
  endDate: Joi.date().allow(null).optional(),
  usageLimit: Joi.number().integer().min(1).allow(null).optional(),
  perUserLimit: Joi.number().integer().min(1).allow(null).optional(),
  autoApply: Joi.boolean().optional(),
}).min(1);

const GENERATE_VOUCHERS_SCHEMA = Joi.object({
  count: Joi.number().integer().min(1).max(500).required(),
  prefix: Joi.string().trim().allow("").optional(),
});

const IMPORT_VOUCHERS_SCHEMA = Joi.object({
  codes: Joi.array()
    .items(Joi.string().trim().min(1).max(64))
    .min(1)
    .max(1000)
    .required(),
});

// A Foxer's own promotion is scoped to exactly one listing they own — no
// transactionType/category input, those are derived server-side from the
// listing itself (see PromotionSvc.resolveOwnScope).
const CREATE_OWN_BODY_SCHEMA = Joi.object({
  name: Joi.string().trim().required(),
  description: Joi.string().trim().allow(null, "").optional(),
  // Not `.uuid()`: seeded and some legacy Asset/Service/Venue rows use
  // non-UUID string ids.
  assetId: Joi.string().trim().optional(),
  serviceId: Joi.string().trim().optional(),
  venueId: Joi.string().trim().optional(),
  discountType: Joi.string().valid("percentage", "fixed").required(),
  discountValue: Joi.number().positive().required(),
  minSubtotal: Joi.number().min(0).allow(null).optional(),
  maxDiscount: Joi.number().min(0).allow(null).optional(),
  startDate: Joi.date().allow(null).optional(),
  endDate: Joi.date().allow(null).optional(),
  usageLimit: Joi.number().integer().min(1).allow(null).optional(),
  perUserLimit: Joi.number().integer().min(1).allow(null).optional(),
  autoApply: Joi.boolean().optional(),
})
  .xor("assetId", "serviceId", "venueId")
  .messages({
    "object.xor":
      "A promotion must be scoped to exactly one of assetId, serviceId or venueId",
  });

const UPDATE_OWN_BODY_SCHEMA = Joi.object({
  name: Joi.string().trim().optional(),
  description: Joi.string().trim().allow(null, "").optional(),
  discountType: Joi.string().valid("percentage", "fixed").optional(),
  discountValue: Joi.number().positive().optional(),
  minSubtotal: Joi.number().min(0).allow(null).optional(),
  maxDiscount: Joi.number().min(0).allow(null).optional(),
  active: Joi.boolean().optional(),
  startDate: Joi.date().allow(null).optional(),
  endDate: Joi.date().allow(null).optional(),
  usageLimit: Joi.number().integer().min(1).allow(null).optional(),
  perUserLimit: Joi.number().integer().min(1).allow(null).optional(),
  autoApply: Joi.boolean().optional(),
}).min(1);

export default class PromotionCtrl {
  static async getAll(req: Request, res: Response) {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const promotions = await PromotionSvc.getAll(includeInactive);
      return res.status(200).json({ success: true, data: promotions });
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

      const promotion = await PromotionSvc.getById(value.id);
      return res.status(200).json({ success: true, data: promotion });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const { error, value } = CREATE_BODY_SCHEMA.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const promotion = await PromotionSvc.create(value);
      return res.status(201).json({ success: true, data: promotion });
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

      const promotion = await PromotionSvc.update(params.id, value);
      return res.status(200).json({ success: true, data: promotion });
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

      await PromotionSvc.remove(value.id);
      return res
        .status(200)
        .json({ success: true, message: "Promotion deactivated" });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async generateVouchers(req: Request, res: Response) {
    try {
      const paramsSchema = Joi.object({ id: Joi.string().uuid().required() });
      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError)
        return res.status(400).json({ message: paramsError.message });

      const { error, value } = GENERATE_VOUCHERS_SCHEMA.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const vouchers = await PromotionSvc.generateVouchers(
        params.id,
        value.count,
        value.prefix,
      );
      return res.status(201).json({ success: true, data: vouchers });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async importVouchers(req: Request, res: Response) {
    try {
      const paramsSchema = Joi.object({ id: Joi.string().uuid().required() });
      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError)
        return res.status(400).json({ message: paramsError.message });

      const { error, value } = IMPORT_VOUCHERS_SCHEMA.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const result = await PromotionSvc.importVouchers(params.id, value.codes);
      return res.status(201).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getAnalytics(req: Request, res: Response) {
    try {
      const schema = Joi.object({ id: Joi.string().uuid().required() });
      const { error, value } = schema.validate(req.params);
      if (error) return res.status(400).json({ message: error.message });

      const analytics = await PromotionSvc.getAnalytics(value.id);
      return res.status(200).json({ success: true, data: analytics });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async setVoucherActive(req: Request, res: Response) {
    try {
      const paramsSchema = Joi.object({
        voucherId: Joi.string().uuid().required(),
      });
      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError)
        return res.status(400).json({ message: paramsError.message });

      const schema = Joi.object({ active: Joi.boolean().required() });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const voucher = await PromotionSvc.setVoucherActive(
        params.voucherId,
        value.active,
      );
      return res.status(200).json({ success: true, data: voucher });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ── Foxer-owned promotions ────────────────────────────────────────────

  static async getAllOwn(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const promotions = await PromotionSvc.getAllForProvider(providerId);
      return res.status(200).json({ success: true, data: promotions });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async createOwn(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const { error, value } = CREATE_OWN_BODY_SCHEMA.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const promotion = await PromotionSvc.createOwn(providerId, value);
      return res.status(201).json({ success: true, data: promotion });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message === "Unauthorized" ? 403 : 400;
      return res
        .status(status)
        .json({ success: false, message: error.message });
    }
  }

  static async updateOwn(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const paramsSchema = Joi.object({ id: Joi.string().uuid().required() });
      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError)
        return res.status(400).json({ message: paramsError.message });

      const { error, value } = UPDATE_OWN_BODY_SCHEMA.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const promotion = await PromotionSvc.updateOwn(
        providerId,
        params.id,
        value,
      );
      return res.status(200).json({ success: true, data: promotion });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message === "Unauthorized" ? 403 : 400;
      return res
        .status(status)
        .json({ success: false, message: error.message });
    }
  }

  static async removeOwn(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const schema = Joi.object({ id: Joi.string().uuid().required() });
      const { error, value } = schema.validate(req.params);
      if (error) return res.status(400).json({ message: error.message });

      await PromotionSvc.removeOwn(providerId, value.id);
      return res
        .status(200)
        .json({ success: true, message: "Promotion deactivated" });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message === "Unauthorized" ? 403 : 400;
      return res
        .status(status)
        .json({ success: false, message: error.message });
    }
  }

  static async generateVouchersOwn(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const paramsSchema = Joi.object({ id: Joi.string().uuid().required() });
      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError)
        return res.status(400).json({ message: paramsError.message });

      const { error, value } = GENERATE_VOUCHERS_SCHEMA.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const vouchers = await PromotionSvc.generateVouchersOwn(
        providerId,
        params.id,
        value.count,
        value.prefix,
      );
      return res.status(201).json({ success: true, data: vouchers });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message === "Unauthorized" ? 403 : 400;
      return res
        .status(status)
        .json({ success: false, message: error.message });
    }
  }

  static async importVouchersOwn(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const paramsSchema = Joi.object({ id: Joi.string().uuid().required() });
      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError)
        return res.status(400).json({ message: paramsError.message });

      const { error, value } = IMPORT_VOUCHERS_SCHEMA.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const result = await PromotionSvc.importVouchersOwn(
        providerId,
        params.id,
        value.codes,
      );
      return res.status(201).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message === "Unauthorized" ? 403 : 400;
      return res
        .status(status)
        .json({ success: false, message: error.message });
    }
  }

  static async getAnalyticsOwn(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const schema = Joi.object({ id: Joi.string().uuid().required() });
      const { error, value } = schema.validate(req.params);
      if (error) return res.status(400).json({ message: error.message });

      const analytics = await PromotionSvc.getAnalyticsOwn(
        providerId,
        value.id,
      );
      return res.status(200).json({ success: true, data: analytics });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message === "Unauthorized" ? 403 : 400;
      return res
        .status(status)
        .json({ success: false, message: error.message });
    }
  }

  static async setVoucherActiveOwn(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const paramsSchema = Joi.object({
        voucherId: Joi.string().uuid().required(),
      });
      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError)
        return res.status(400).json({ message: paramsError.message });

      const schema = Joi.object({ active: Joi.boolean().required() });
      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const voucher = await PromotionSvc.setVoucherActiveOwn(
        providerId,
        params.voucherId,
        value.active,
      );
      return res.status(200).json({ success: true, data: voucher });
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message === "Unauthorized" ? 403 : 400;
      return res
        .status(status)
        .json({ success: false, message: error.message });
    }
  }
}
