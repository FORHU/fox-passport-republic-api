import { sendServerError } from "../../utils/errors";
import { Request, Response } from "express";
import Joi from "joi";
import CategorySvc from "./category.service";
import ProviderSpecialtySvc from "../users/provider-specialty.service";
import { announceAdminQueueChanged } from "../../infrastructure/socket/invalidate";
import { sendValidationError, VALIDATE_ALL } from "../../utils/validation";

// Slugs match the values listings store, which use underscores ("beach_resort").
const SLUG = Joi.string()
  .lowercase()
  .max(60)
  .pattern(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/)
  .messages({
    "string.pattern.base":
      "Slug may only contain lowercase letters, numbers, underscores and hyphens.",
  });

const CREATE_BODY_SCHEMA = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  slug: SLUG.required(),
  description: Joi.string().trim().max(500).allow("", null).optional(),
  icon: Joi.string().trim().max(50).allow("", null).optional(),
  parentCategoryId: Joi.string().uuid().required(),
});

// No slug: it links the row to listing values, so it is fixed at creation.
const UPDATE_BODY_SCHEMA = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  description: Joi.string().trim().max(500).allow("", null).optional(),
  icon: Joi.string().trim().max(50).allow("", null).optional(),
  parentCategoryId: Joi.string().uuid().optional(),
}).min(1);

/** An empty optional text field clears the column. */
const blankToNull = <T extends Record<string, unknown>>(body: T): T => {
  const out: Record<string, unknown> = { ...body };
  for (const key of ["description", "icon"]) {
    if (out[key] === "") out[key] = null;
  }
  return out as T;
};

const actorOf = (req: Request) => ({
  userId: req.user!.userId,
  email: req.user!.email,
});

export default class CategoryController {
  // GET ALL CATEGORIES
  static async getAllCategories(req: Request, res: Response) {
    try {
      const categories = await CategorySvc.getAllCategories(
        req.query.includeEmpty === "true",
      );
      return res.status(200).json({
        success: true,
        count: categories.length,
        data: categories,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  // GET THE SPECIALTIES A PROVIDER CAN PICK (apply form, profile, search)
  static async getProviderSpecialties(_req: Request, res: Response) {
    try {
      const data = await ProviderSpecialtySvc.list();
      return res.status(200).json({ success: true, count: data.length, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  // GET TOP-LEVEL CATEGORIES
  static async getTopLevelCategories(req: Request, res: Response) {
    try {
      const categories = await CategorySvc.getTopLevelCategories();
      return res.status(200).json({
        success: true,
        count: categories.length,
        data: categories,
      });
    } catch (e: unknown) {
      console.error("Get top-level categories error:", e);
      return sendServerError(res, e, { success: true });
    }
  }

  // GET PROVIDER SPECIALTIES (public: the options for the apply form, the
  // profile settings and the search and leaderboard filters)
  static async getProviderSpecialties(_req: Request, res: Response) {
    try {
      const specialties = await CategorySvc.getProviderSpecialties();
      return res.status(200).json({
        success: true,
        count: specialties.length,
        data: specialties,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  // GET CATEGORY BY ID
  static async getCategoryById(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        id: Joi.string().uuid().required(),
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const category = await CategorySvc.getCategoryById(value.id);
      return res.status(200).json({
        success: true,
        data: category,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  // GET CATEGORY BY SLUG
  static async getCategoryBySlug(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        slug: Joi.string().required(),
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const category = await CategorySvc.getCategoryBySlug(value.slug);
      return res.status(200).json({
        success: true,
        data: category,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  // CREATE CATEGORY
  static async createCategory(req: Request, res: Response) {
    try {
      const { error, value } = CREATE_BODY_SCHEMA.validate(
        req.body,
        VALIDATE_ALL,
      );
      if (error) {
        return sendValidationError(res, error, { success: true });
      }

      const category = await CategorySvc.createCategory(
        blankToNull(value),
        actorOf(req),
      );
      announceAdminQueueChanged();
      return res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: category,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  // UPDATE CATEGORY
  static async updateCategory(req: Request, res: Response) {
    try {
      const paramsSchema = Joi.object({
        id: Joi.string().uuid().required(),
      });

      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params,
      );
      if (paramsError) {
        return res.status(400).json({ message: paramsError.message });
      }

      const { error: bodyError, value: body } = UPDATE_BODY_SCHEMA.validate(
        req.body,
        VALIDATE_ALL,
      );
      if (bodyError) {
        return sendValidationError(res, bodyError, { success: true });
      }

      const category = await CategorySvc.updateCategory(
        params.id,
        blankToNull(body),
        actorOf(req),
      );
      announceAdminQueueChanged();
      return res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: category,
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }

  // DELETE CATEGORY
  static async deleteCategory(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        id: Joi.string().uuid().required(),
      });

      const { error, value } = schema.validate(req.params);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      await CategorySvc.deleteCategory(value.id);
      announceAdminQueueChanged();
      return res.status(200).json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: true });
    }
  }
}
