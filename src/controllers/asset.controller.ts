import { Request, Response } from "express";
import Joi from "joi";
import AssetSvc from "../services/asset.service";
import { AssetCondition, AssetStatus, BillingRate } from "@prisma/client";

export default class AssetCtrl {

  //Create Asset Controller
  static async createAsset(req: Request, res: Response) {
    const schema = Joi.object({
      category: Joi.string().required(),
      name: Joi.string().required(),
      description: Joi.string().required(),
      quantity: Joi.number().integer().min(1).optional(),
      condition: Joi.string().valid(...Object.values(AssetCondition)).optional(),
      price: Joi.number().required(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string().valid(...Object.values(BillingRate)).optional(),
      imgIds: Joi.array().items(Joi.string()).min(1).max(5).required(),
      status: Joi.string().valid(...Object.values(AssetStatus)).optional(),
    });

    const { error, value } = schema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      // ownerId comes from the authenticated user's JWT token
      const ownerId = (req as any).user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const asset = await AssetSvc.createAsset({
        ownerId: String(ownerId),
        ...value,
        imgIds: value.imgIds,
      });
      return res.status(201).json({ message: "Asset created successfully", asset });
    } catch (error: any) {
      if (error?.message?.startsWith("Category with slug") ) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message || error });
    }
  }

  //READ Assets Controller with optional query parameters for filtering by ownerId and categoryId
    static async getAssets(req: Request, res: Response) {
    try {
      const { ownerId, category } = req.query;

      const assets = await AssetSvc.getAssets({
        ...(ownerId && { ownerId: String(ownerId) }),
        ...(category && { category: String(category) }),
      });

      return res.status(200).json({ assets });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || error });
    }
  }

  //READ Asset by ID Controller
   static async getAssetById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const idNum = String(id);
      if (!id || typeof id !== "string") {
      return res.status(400).json({ message: "Invalid asset id" });
    }

      const asset = await AssetSvc.getAssetById(idNum);
      return res.status(200).json({ asset });
    } catch (error: any) {
      return res.status(404).json({ message: error.message || error });
    }
  }

  //UPDATE Asset Controller - allows partial updates; validates fields if provided; checks ownership before updating
  static async updateAsset(req: Request, res: Response) {   
    // request body may include any subset of fields; when `images` is
    const schema = Joi.object({
      category: Joi.string().optional(),
      name: Joi.string().optional(),
      description: Joi.string().optional(),
      quantity: Joi.number().integer().min(1).optional(),
      price: Joi.number().min(0).optional(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string().valid(...Object.values(BillingRate)).optional(),
      condition: Joi.string().valid(...Object.values(AssetCondition)).optional(),
      status: Joi.string().valid(...Object.values(AssetStatus)).optional(),
    }).min(1);

    const { error, value } = schema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const { id } = req.params;
      if (!id || typeof id !== "string") {
        return res.status(400).json({ message: "Invalid asset id" });
      }

      const ownerId = (req as any).user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const asset = await AssetSvc.updateAsset(String(id), String(ownerId), value);
      return res.status(200).json({ message: "Asset updated successfully", asset });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || error });
    }
  }

  //DELETE Asset Controller - checks ownership before deleting
  static async deleteAsset(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const requesterId = (req as any).user?.userId;

      if (!requesterId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const result = await AssetSvc.deleteAsset(String(id), String(requesterId));
      return res.status(200).json(result);
    } catch (error: any) {
      const status = error.message.includes("authorized") ? 403 : 400;
      return res.status(status).json({ message: error.message || error });
    }
  }

}

