import { Request, Response } from "express";
import Joi from "joi";
import { prisma } from "../utils/prisma";
import AssetSvc from "../services/asset.service";
import { sendApprovedEmail } from "../utils/emails/approved";
import { sendRejectedEmail } from "../utils/emails/rejected";
import {
  AssetCondition,
  AssetStatus,
  BillingRate,
  AssetCategory,
} from "@prisma/client";
import { toEnum } from "../utils/enums";

interface CreateAssetPayload {
  category: AssetCategory;
  name: string;
  description: string;
  quantity?: number;
  condition?: AssetCondition;
  price: number;
  currency?: string;
  billingRate?: BillingRate;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lng?: number;
  imgIds: string[];
  status?: AssetStatus;
  cancellationPolicyId?: string;
}

type UpdateAssetPayload = Partial<CreateAssetPayload>;

export default class AssetCtrl {
  //Create Asset Controller
  static async createAsset(req: Request, res: Response) {
    const schema = Joi.object<CreateAssetPayload>({
      category: Joi.string()
        .valid(...Object.values(AssetCategory))
        .required(),
      name: Joi.string().required(),
      description: Joi.string().required(),
      quantity: Joi.number().integer().min(1).optional(),
      condition: Joi.string()
        .valid(...Object.values(AssetCondition))
        .optional(),
      price: Joi.number().required(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string()
        .valid(...Object.values(BillingRate))
        .optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().optional(),
      lat: Joi.number().optional(),
      lng: Joi.number().optional(),
      imgIds: Joi.array().items(Joi.string()).min(1).max(5).required(),
      status: Joi.string()
        .valid(...Object.values(AssetStatus))
        .optional(),
      cancellationPolicyId: Joi.string().uuid().optional(),
    });

    const { error, value } = schema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      // ownerId comes from the authenticated user's JWT token
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const asset = await AssetSvc.createAsset({
        ownerId: String(ownerId),
        ...value,
      });
      return res
        .status(201)
        .json({ message: "Asset created successfully", asset });
    } catch (e: unknown) {
      const error = e as Error;
      if (error?.message?.startsWith("Category with slug")) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message || error });
    }
  }

  //READ Assets Controller with optional query parameters for filtering by ownerId and categoryId
  static async getAssets(req: Request, res: Response) {
    try {
      const { ownerId, category, city, page, limit } = req.query;
      // An unrecognised category drops the filter instead of reaching Prisma,
      // which would reject it and turn a bad query string into a 500.
      const assetCategory = toEnum(AssetCategory, category);

      const { assets, total } = await AssetSvc.getAssets({
        ...(ownerId && { ownerId: String(ownerId) }),
        ...(assetCategory && { category: assetCategory }),
        ...(city && { city: String(city) }),
        page: page ? Number(page) : undefined,
        limit: limit ? Math.min(Number(limit), 50) : undefined,
      });

      return res.status(200).json({ assets, total });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ message: error.message || error });
    }
  }

  // Public browse for the search page — item-level pagination (city matches the
  // owner's city, price filters the item itself; only gearFoxer-owned assets).
  static async browseAssets(req: Request, res: Response) {
    try {
      const { city, maxPrice, page, limit } = req.query;
      const parsedLimit = limit ? Math.min(Number(limit), 50) : 10;
      const parsedPage = page ? Number(page) : 1;

      const { assets, total } = await AssetSvc.browseAssets({
        ...(city && { ownerCity: String(city) }),
        ...(maxPrice && { maxPrice: Number(maxPrice) }),
        page: parsedPage,
        limit: parsedLimit,
      });

      return res.status(200).json({
        success: true,
        data: assets,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: Math.max(1, Math.ceil(total / parsedLimit)),
        },
      });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
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
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ message: error.message || error });
    }
  }

  //UPDATE Asset Controller - allows partial updates; validates fields if provided; checks ownership before updating
  static async updateAsset(req: Request, res: Response) {
    // request body may include any subset of fields; when `images` is
    const schema = Joi.object<UpdateAssetPayload>({
      category: Joi.string()
        .valid(...Object.values(AssetCategory))
        .optional(),
      name: Joi.string().optional(),
      description: Joi.string().optional(),
      quantity: Joi.number().integer().min(1).optional(),
      price: Joi.number().min(0).optional(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string()
        .valid(...Object.values(BillingRate))
        .optional(),
      condition: Joi.string()
        .valid(...Object.values(AssetCondition))
        .optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().optional(),
      lat: Joi.number().optional(),
      lng: Joi.number().optional(),
      status: Joi.string()
        .valid(...Object.values(AssetStatus))
        .optional(),
      cancellationPolicyId: Joi.string().uuid().optional(),
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

      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const asset = await AssetSvc.updateAsset(
        String(id),
        String(ownerId),
        value,
      );
      return res
        .status(200)
        .json({ message: "Asset updated successfully", asset });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ message: error.message || error });
    }
  }

  //DELETE Asset Controller - checks ownership before deleting
  static async deleteAsset(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const requesterId = req.user?.userId;

      if (!requesterId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const result = await AssetSvc.deleteAsset(
        String(id),
        String(requesterId),
      );
      return res.status(200).json(result);
    } catch (e: unknown) {
      const error = e as Error;
      const status = error.message.includes("authorized") ? 403 : 400;
      return res.status(status).json({ message: error.message || error });
    }
  }

  static async approveAsset(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || user.systemRole !== "admin") {
        return res
          .status(403)
          .json({ message: "Forbidden: Admin access required" });
      }
      const asset = await prisma.asset.update({
        where: { id: req.params.id },
        data: { status: AssetStatus.available },
      });

      try {
        const full = await prisma.asset.findUnique({
          where: { id: asset.id },
          include: { owner: { select: { email: true, name: true } } },
        });
        if (full?.owner?.email) {
          sendApprovedEmail({
            to: full.owner.email,
            entityName: full.name,
            entityType: "Asset",
          });
        }
      } catch (emailErr) {
        console.error("Failed to send approval email:", emailErr);
      }

      return res
        .status(200)
        .json({ message: "Asset approved successfully", asset });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ message: error.message || error });
    }
  }

  static async rejectAsset(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user || user.systemRole !== "admin") {
        return res
          .status(403)
          .json({ message: "Forbidden: Admin access required" });
      }
      const { reason } = req.body;
      if (!reason) {
        return res
          .status(400)
          .json({ message: "Rejection reason is required" });
      }
      const asset = await prisma.asset.update({
        where: { id: req.params.id },
        data: { status: AssetStatus.rejected, rejectionReason: reason },
      });

      try {
        const full = await prisma.asset.findUnique({
          where: { id: asset.id },
          include: { owner: { select: { email: true, name: true } } },
        });
        if (full?.owner?.email) {
          sendRejectedEmail({
            to: full.owner.email,
            entityName: full.name,
            entityType: "Asset",
            reason,
          });
        }
      } catch (emailErr) {
        console.error("Failed to send rejection email:", emailErr);
      }

      return res
        .status(200)
        .json({ message: "Asset rejected successfully", asset });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(404).json({ message: error.message || error });
    }
  }
}
