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

export default class AssetCtrl {
  //Create Asset Controller
  static async createAsset(req: Request, res: Response) {
    const schema = Joi.object({
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
      const ownerId = (req as any).user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const asset = await AssetSvc.createAsset({
        ownerId: String(ownerId),
        ...(value as any),
      });
      return res
        .status(201)
        .json({ message: "Asset created successfully", asset });
    } catch (error: any) {
      if (error?.message?.startsWith("Category with slug")) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message || error });
    }
  }

  //READ Assets Controller with optional query parameters for filtering by ownerId and categoryId
  static async getAssets(req: Request, res: Response) {
    try {
      const { ownerId, category, page, limit } = req.query;

      const { assets, total } = await AssetSvc.getAssets({
        ...(ownerId && { ownerId: String(ownerId) }),
        ...(category && { category: category as any }),
        page: page ? Number(page) : undefined,
        limit: limit ? Math.min(Number(limit), 50) : undefined,
      });

      return res.status(200).json({ assets, total });
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

      const ownerId = (req as any).user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const asset = await AssetSvc.updateAsset(
        String(id),
        String(ownerId),
        value as any,
      );
      return res
        .status(200)
        .json({ message: "Asset updated successfully", asset });
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

      const result = await AssetSvc.deleteAsset(
        String(id),
        String(requesterId),
      );
      return res.status(200).json(result);
    } catch (error: any) {
      const status = error.message.includes("authorized") ? 403 : 400;
      return res.status(status).json({ message: error.message || error });
    }
  }

  static async approveAsset(req: Request, res: Response) {
    try {
      const user = (req as any).user;
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
    } catch (error: any) {
      return res.status(404).json({ message: error.message || error });
    }
  }

  static async rejectAsset(req: Request, res: Response) {
    try {
      const user = (req as any).user;
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
    } catch (error: any) {
      return res.status(404).json({ message: error.message || error });
    }
  }
}
