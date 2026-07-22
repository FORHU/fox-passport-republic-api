import { Request, Response } from "express";
import Joi from "joi";
import { prisma } from "../utils/prisma";
import ServiceSvc from "../services/service.service";
import { sendApprovedEmail } from "../utils/emails/approved";
import { sendRejectedEmail } from "../utils/emails/rejected";
import { BillingRate, ServiceStatus, ServiceCategory } from "@prisma/client";

export default class ServiceCtrl {
  static async createService(req: Request, res: Response) {
    const schema = Joi.object({
      category: Joi.string()
        .valid(...Object.values(ServiceCategory))
        .required(),
      name: Joi.string().required(),
      description: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().optional(),
      country: Joi.string().required(),
      lat: Joi.number().optional(),
      lng: Joi.number().optional(),
      isWillingToTravel: Joi.boolean().optional(),
      tags: Joi.array().items(Joi.string().trim().min(1)).optional(),
      price: Joi.number().required(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string()
        .valid(...Object.values(BillingRate))
        .optional(),
      imgIds: Joi.array().items(Joi.string()).min(1).max(5).required(),
      status: Joi.string()
        .valid(...Object.values(ServiceStatus))
        .optional(),
      cancellationPolicyId: Joi.string().uuid().optional(),
    });

    const { error, value } = schema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    try {
      const ownerId = (req as any).user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const service = await ServiceSvc.createService({
        ownerId: String(ownerId),
        ...(value as any),
      });
      return res
        .status(201)
        .json({ message: "Service created successfully", service });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || err });
    }
  }

  static async getServices(req: Request, res: Response) {
    try {
      const { ownerId, category, status, city } = req.query;

      const services = await ServiceSvc.getAllServices({
        ...(ownerId && { ownerId: String(ownerId) }),
        ...(category && { category: category as any }),
        ...(status && { status: status as ServiceStatus }),
        ...(city && { city: String(city) }),
      });

      return res.status(200).json({ services });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || err });
    }
  }

  static async getServiceById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id || typeof id !== "string") {
        return res.status(400).json({ message: "Invalid service id" });
      }

      const service = await ServiceSvc.getServiceById(String(id));
      return res.status(200).json({ service });
    } catch (err: any) {
      return res.status(404).json({ message: err.message || err });
    }
  }

  static async updateService(req: Request, res: Response) {
    const schema = Joi.object({
      category: Joi.string()
        .valid(...Object.values(ServiceCategory))
        .optional(),
      name: Joi.string().optional(),
      description: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().allow("").optional(),
      country: Joi.string().optional(),
      lat: Joi.number().optional(),
      lng: Joi.number().optional(),
      isWillingToTravel: Joi.boolean().optional(),
      tags: Joi.array().items(Joi.string().trim().min(1)).optional(),
      price: Joi.number().min(0).optional(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string()
        .valid(...Object.values(BillingRate))
        .optional(),
      status: Joi.string()
        .valid(...Object.values(ServiceStatus))
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
        return res.status(400).json({ message: "Invalid service id" });
      }

      const ownerId = (req as any).user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const service = await ServiceSvc.updateService(
        String(id),
        String(ownerId),
        value as any,
      );
      return res
        .status(200)
        .json({ message: "Service updated successfully", service });
    } catch (err: any) {
      const status = err.message.includes("Unauthorized") ? 403 : 400;
      return res.status(status).json({ message: err.message || err });
    }
  }

  static async deleteService(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const requesterId = (req as any).user?.userId;

      if (!requesterId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const result = await ServiceSvc.deleteService(
        String(id),
        String(requesterId),
      );
      return res.status(200).json(result);
    } catch (err: any) {
      const status = err.message.includes("authorized") ? 403 : 400;
      return res.status(status).json({ message: err.message || err });
    }
  }

  static async approveService(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user || user.systemRole !== "admin") {
        return res
          .status(403)
          .json({ message: "Forbidden: Admin access required" });
      }
      const service = await prisma.service.update({
        where: { id: req.params.id },
        data: { status: ServiceStatus.available },
      });

      try {
        const full = await prisma.service.findUnique({
          where: { id: service.id },
          include: { owner: { select: { email: true, name: true } } },
        });
        if (full?.owner?.email) {
          sendApprovedEmail({
            to: full.owner.email,
            entityName: full.name,
            entityType: "Service",
          });
        }
      } catch (emailErr) {
        console.error("Failed to send approval email:", emailErr);
      }

      return res
        .status(200)
        .json({ message: "Service approved successfully", service });
    } catch (error: any) {
      return res.status(404).json({ message: error.message || error });
    }
  }

  static async rejectService(req: Request, res: Response) {
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
      const service = await prisma.service.update({
        where: { id: req.params.id },
        data: { status: ServiceStatus.rejected, rejectionReason: reason },
      });

      try {
        const full = await prisma.service.findUnique({
          where: { id: service.id },
          include: { owner: { select: { email: true, name: true } } },
        });
        if (full?.owner?.email) {
          sendRejectedEmail({
            to: full.owner.email,
            entityName: full.name,
            entityType: "Service",
            reason,
          });
        }
      } catch (emailErr) {
        console.error("Failed to send rejection email:", emailErr);
      }

      return res
        .status(200)
        .json({ message: "Service rejected successfully", service });
    } catch (error: any) {
      return res.status(404).json({ message: error.message || error });
    }
  }
}
