import { Request, Response } from "express";
import Joi from "joi";
import ServiceSvc from "../services/service.service";
import { BillingRate, ServiceStatus } from "@prisma/client";

export default class ServiceCtrl {
  static async createService(req: Request, res: Response) {
    const schema = Joi.object({
      category: Joi.string().required(),
      name: Joi.string().required(),
      description: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().optional(),
      country: Joi.string().required(),
      isWillingToTravel: Joi.boolean().optional(),
      tags: Joi.array().items(Joi.string().trim().min(1)).optional(),
      price: Joi.number().required(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string().valid(...Object.values(BillingRate)).optional(),
      imgIds: Joi.array().items(Joi.string()).min(1).max(5).required(),
      status: Joi.string().valid(...Object.values(ServiceStatus)).optional(),
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
        ...value,
        imgIds: value.imgIds,
      });
      return res.status(201).json({ message: "Service created successfully", service });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || err });
    }
  }

  static async getServices(req: Request, res: Response) {
    try {
      const { ownerId, category, status } = req.query;

      const services = await ServiceSvc.getAllServices({
        ...(ownerId && { ownerId: String(ownerId) }),
        ...(category && { category: String(category) }),
        ...(status && { status: status as ServiceStatus }),
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
      category: Joi.string().optional(),
      name: Joi.string().optional(),
      description: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().allow("").optional(),
      country: Joi.string().optional(),
      isWillingToTravel: Joi.boolean().optional(),
      tags: Joi.array().items(Joi.string().trim().min(1)).optional(),
      price: Joi.number().min(0).optional(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string().valid(...Object.values(BillingRate)).optional(),
      status: Joi.string().valid(...Object.values(ServiceStatus)).optional(),
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

      const service = await ServiceSvc.updateService(String(id), String(ownerId), value);
      return res.status(200).json({ message: "Service updated successfully", service });
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

      const result = await ServiceSvc.deleteService(String(id), String(requesterId));
      return res.status(200).json(result);
    } catch (err: any) {
      const status = err.message.includes("authorized") ? 403 : 400;
      return res.status(status).json({ message: err.message || err });
    }
  }
}
