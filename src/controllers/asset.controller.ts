import { Request, Response } from "express";
import Joi from "joi";
import AssetSvc from "../services/asset.service";
import AssetRentalSvc from "../services/assetRental.service";
import CategorySvc from "../services/category.service";

export default class AssetCtrl {

  //Create Asset Controller
  static async createAsset(req: Request, res: Response) {
    const schema = Joi.object({
      name: Joi.string().required(),
      description: Joi.string().required(),
      hostId: Joi.number().required(),
      // either a numeric ID or the slug (frontend fallback)
      categoryId: Joi.number().integer().optional().allow(null).messages({
        "number.base": "\"categoryId\" must be a number",
        "number.integer": "\"categoryId\" must be an integer",
      }),
      categorySlug: Joi.string().optional(),
      condition: Joi.string().valid("new", "good", "fair", "refurbished").optional(),
      propertyType: Joi.string().optional(),
      roomType: Joi.string().optional(),
      capacity: Joi.number().integer().min(1).optional(),
      maxAttendees: Joi.number().integer().min(1).optional(),
      images: Joi.array()
        .items(
          Joi.object({
            url: Joi.string().uri().required(),
            altText: Joi.string().optional(),
            orderIndex: Joi.number().optional(),
            isThumbnail: Joi.boolean().optional(),
          })
        )
        .optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      // ownerId comes from the authenticated user's JWT token
      const ownerId = (req as any).user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // ensure categoryId is a number (Joi should handle this, but be explicit)
      let assetData: any = { ...value, ownerId };

      // if slug was sent and we don't yet have an ID, resolve it
      if ((assetData.categoryId === undefined || assetData.categoryId === null) && assetData.categorySlug) {
        try {
          const cat = await CategorySvc.getCategoryBySlug(assetData.categorySlug);
          assetData.categoryId = cat.id;
        } catch (e) {
          // leave it null if slug not found
          assetData.categoryId = null;
        }
      }

      if (assetData.categoryId !== undefined && assetData.categoryId !== null) {
        assetData.categoryId = Number(assetData.categoryId);
      }
      const asset = await AssetSvc.createAsset(assetData);
      return res.status(201).json({ message: "Asset created successfully", asset });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || error });
    }
  }

  //READ Assets Controller with optional query parameters for filtering by ownerId and categoryId
    static async getAssets(req: Request, res: Response) {
    try {
      const { ownerId, categoryId } = req.query;

      const assets = await AssetSvc.getAssets({
        ...(ownerId && { ownerId: Number(ownerId) }),
        ...(categoryId && { categoryId: Number(categoryId) }),
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
      const idNum = Number(id);
      if (!Number.isInteger(idNum) || idNum <= 0) {
        return res.status(400).json({ message: "Invalid asset id" });
      }

      const asset = await AssetSvc.getAssetById(idNum);
      return res.status(200).json({ asset });
    } catch (error: any) {
      return res.status(404).json({ message: error.message || error });
    }
  }

  //GET rentals for a given asset
  static async getAssetRentals(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const idNum = Number(id);
      if (!Number.isInteger(idNum) || idNum <= 0) {
        return res.status(400).json({ message: "Invalid asset id" });
      }

      const rentals = await AssetRentalSvc.getRentalsForAsset(idNum);
      return res.status(200).json({ rentals });
    } catch (error: any) {
      return res.status(500).json({ message: error.message || error });
    }
  }

  //RENT Asset Controller
  static async rentAsset(req: Request, res: Response) {
    const schema = Joi.object({
      startDate: Joi.date().required(),
      endDate: Joi.date().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const { id } = req.params;
      const assetId = Number(id);
      if (!Number.isInteger(assetId) || assetId <= 0) {
        return res.status(400).json({ message: "Invalid asset id" });
      }

      const renterId = (req as any).user?.userId;
      if (!renterId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const rental = await AssetRentalSvc.rentAsset(
        assetId,
        renterId,
        new Date(value.startDate),
        new Date(value.endDate)
      );
      return res.status(201).json({ message: "Asset rented successfully", rental });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || error });
    }
  }

  //UPDATE Asset Controller - allows partial updates; validates fields if provided; checks ownership before updating
  static async updateAsset(req: Request, res: Response) {   
    // request body may include any subset of fields; when `images` is
    const schema = Joi.object({
      name: Joi.string().optional(),
      description: Joi.string().optional(),
      hostId: Joi.number().optional(),
      categoryId: Joi.number().integer().allow(null).optional().messages({
        "number.base": "\"categoryId\" must be a number",
        "number.integer": "\"categoryId\" must be an integer",
      }),
      categorySlug: Joi.string().optional(),
      images: Joi.array()
        .items(
          Joi.object({
            url: Joi.string().uri().required(),
            altText: Joi.string().optional(),
            orderIndex: Joi.number().optional(),
            isThumbnail: Joi.boolean().optional(),
          })
        )
        .optional(),
    }).min(1);

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const { id } = req.params;
      const idNum = Number(id);
      if (!Number.isInteger(idNum) || idNum <= 0) {
        return res.status(400).json({ message: "Invalid asset id" });
      }

      const ownerId = (req as any).user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      let updateData: any = value;
      // allow slug on update too
      if ((updateData.categoryId === undefined || updateData.categoryId === null) && updateData.categorySlug) {
        try {
          const cat = await CategorySvc.getCategoryBySlug(updateData.categorySlug);
          updateData.categoryId = cat.id;
        } catch (e) {
          updateData.categoryId = null;
        }
      }

      if (updateData.categoryId !== undefined && updateData.categoryId !== null) {
        updateData.categoryId = Number(updateData.categoryId);
      }
      const asset = await AssetSvc.updateAsset(idNum, ownerId, updateData);
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

      const result = await AssetSvc.deleteAsset(Number(id), Number(requesterId));
      return res.status(200).json(result);
    } catch (error: any) {
      const status = error.message.includes("authorized") ? 403 : 400;
      return res.status(status).json({ message: error.message || error });
    }
  }
}

