import { Request, Response } from "express";
import Joi from "joi";
import AssetSvc from "../services/asset.service";
import AssetRentalSvc from "../services/assetRental.service";

export default class AssetCtrl {

  //Create Asset Controller
  static async createAsset(req: Request, res: Response) {
    const schema = Joi.object({
      name: Joi.string().required(),
      description: Joi.string().required(),
      hostId: Joi.string().optional(),
      // either a string ID or the slug (frontend fallback)
      categoryId: Joi.string().optional().messages({
        "string.base": "\"categoryId\" must be a string",
      }),
      categorySlug: Joi.string().optional(),
      condition: Joi.string().valid("new", "good", "fair", "refurbished").optional(),
      propertyType: Joi.string().optional(),
      roomType: Joi.string().optional(),
      capacity: Joi.number().integer().min(1).optional(),
      maxAttendees: Joi.number().integer().min(1).optional(),
      price: Joi.number().required(),
      billingRate: Joi.string().optional(),
      images: Joi.array().items(Joi.any()).optional(),
    }).xor("categoryId", "categorySlug");

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

      const files = req.files as Express.Multer.File[] | undefined;
      const asset = await AssetSvc.createAssetFromRequest({
        ownerId: String(ownerId),
        body: value,
        files,
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
      const { ownerId, categoryId } = req.query;

      const assets = await AssetSvc.getAssets({
        ...(ownerId && { ownerId: String(ownerId) }),
        ...(categoryId && { categoryId: String(categoryId) }),
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

  //GET rentals for a given asset
  static async getAssetRentals(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const idNum = String(id);
      if (!id || typeof id !== "string") {
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
      const assetId = String(id);
      if (!assetId || typeof assetId !== "string") {
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
      hostId: Joi.string().optional(),
      categoryId: Joi.string().allow(null).optional().messages({
        "string.base": "\"categoryId\" must be a string",
      }),
      categorySlug: Joi.string().optional(),
      price: Joi.number().min(0).optional(),
      billingRate: Joi.string().optional(),
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

      const asset = await AssetSvc.updateAssetFromRequest({
        id: String(id),
        ownerId: String(ownerId),
        body: value,
      });
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

  // IMAGE MANAGEMENT METHODS
  static async uploadAssetImages(req: Request, res: Response) {
    try {
      const ownerId = (req as any).user?.userId;
      const { id } = req.params; // assetId
      const files = req.files as Express.Multer.File[];

      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No images uploaded" });
      }
      const images = await AssetSvc.uploadAssetImages(
        String(id),
        String(ownerId),
        files
      );

      return res.status(201).json({ success: true, data: images });
    } catch (error: any) {
      console.error("🔥 [AssetCtrl] Global Image Upload Error:", error);
      return res.status(400).json({
        message: error.message || "Failed to upload images",
        error: typeof error === 'object' ? error : String(error)
      });
    }
  }

  static async updateAssetImage(req: Request, res: Response) {
    try {
      const ownerId = (req as any).user?.userId;
      const { imageId } = req.params;
      const data = req.body;

      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

      const image = await AssetSvc.updateImage(ownerId, imageId, data);
      return res.status(200).json({ success: true, data: image });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || error });
    }
  }

  static async deleteAssetImage(req: Request, res: Response) {
    try {
      const ownerId = (req as any).user?.userId;
      const { imageId } = req.params;

      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

      await AssetSvc.deleteImage(ownerId, imageId);
      return res.status(200).json({ success: true, message: "Image deleted successfully" });
    } catch (error: any) {
      return res.status(400).json({ message: error.message || error });
    }
  }
}

