import { Request, Response } from "express";
import Joi from "joi";
import CategorySvc from "../services/category.service";

export default class CategoryController {
  // GET ALL CATEGORIES
  static async getAllCategories(req: Request, res: Response) {
    try {
      const categories = await CategorySvc.getAllCategories();
      return res.status(200).json({
        success: true,
        count: categories.length,
        data: categories,
      });
    } catch (error: any) {
      console.error("Get all categories error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch categories",
      });
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
    } catch (error: any) {
      console.error("Get top-level categories error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch top-level categories",
      });
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
    } catch (error: any) {
      console.error("Get category by ID error:", error);
      if (error.message === "Category not found") {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch category",
      });
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
    } catch (error: any) {
      console.error("Get category by slug error:", error);
      if (error.message === "Category not found") {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch category",
      });
    }
  }

  // CREATE CATEGORY
  static async createCategory(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        name: Joi.string().min(2).max(100).required(),
        slug: Joi.string()
          .lowercase()
          .pattern(/^[a-z0-9-]+$/)
          .required(),
        description: Joi.string().max(500).optional(),
        icon: Joi.string().max(50).optional(),
        parentCategoryId: Joi.string().uuid().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        return res.status(400).json({ message: error.message });
      }

      const category = await CategorySvc.createCategory(value);
      return res.status(201).json({
        success: true,
        message: "Category created successfully",
        data: category,
      });
    } catch (error: any) {
      console.error("Create category error:", error);
      if (error.message.includes("already exists")) {
        return res.status(409).json({
          success: false,
          message: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create category",
      });
    }
  }

  // UPDATE CATEGORY
  static async updateCategory(req: Request, res: Response) {
    try {
      const paramsSchema = Joi.object({
        id: Joi.string().uuid().required(),
      });

      const { error: paramsError, value: params } = paramsSchema.validate(
        req.params
      );
      if (paramsError) {
        return res.status(400).json({ message: paramsError.message });
      }

      const bodySchema = Joi.object({
        name: Joi.string().min(2).max(100).optional(),
        slug: Joi.string()
          .lowercase()
          .pattern(/^[a-z0-9-]+$/)
          .optional(),
        description: Joi.string().max(500).optional(),
        icon: Joi.string().max(50).allow(null).optional(),
        parentCategoryId: Joi.string().uuid().allow(null).optional(),
      });

      const { error: bodyError, value: body } = bodySchema.validate(req.body);
      if (bodyError) {
        return res.status(400).json({ message: bodyError.message });
      }

      const category = await CategorySvc.updateCategory(params.id, body);
      return res.status(200).json({
        success: true,
        message: "Category updated successfully",
        data: category,
      });
    } catch (error: any) {
      console.error("Update category error:", error);
      if (error.message === "Category not found") {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      if (
        error.message.includes("already exists") ||
        error.message.includes("own parent")
      ) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update category",
      });
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
      return res.status(200).json({
        success: true,
        message: "Category deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete category error:", error);
      if (error.message === "Category not found") {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to delete category",
      });
    }
  }
}
