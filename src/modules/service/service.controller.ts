import { Request, Response } from "express";
import Joi from "joi";
import { totalPages } from "../../utils/pagination";
import ServiceSvc from "./service.service";
import { BillingRate, ServiceStatus, ServiceCategory } from "@prisma/client";
import { toEnum } from "../../utils/enums";
import { announceAdminQueueChanged } from "../../infrastructure/socket/invalidate";

interface CreateServicePayload {
  category: ServiceCategory;
  name: string;
  description: string;
  city: string;
  state?: string;
  country: string;
  lat?: number;
  lng?: number;
  isWillingToTravel?: boolean;
  tags?: string[];
  price: number;
  currency?: string;
  billingRate?: BillingRate;
  imgIds: string[];
  status?: ServiceStatus;
  cancellationPolicyId?: string;
}

type UpdateServicePayload = Partial<CreateServicePayload>;

export default class ServiceCtrl {
  static async createService(req: Request, res: Response) {
    const schema = Joi.object<CreateServicePayload>({
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
      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const service = await ServiceSvc.createService({
        ownerId: String(ownerId),
        ...value,
      });
      announceAdminQueueChanged();
      return res
        .status(201)
        .json({ message: "Service created successfully", service });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ message: err.message || err });
    }
  }

  static async getServices(req: Request, res: Response) {
    try {
      const { ownerId, category, status, city, page, limit } = req.query;
      // Unrecognised values drop their filter instead of reaching Prisma,
      // which would reject them and turn a bad query string into a 500.
      const serviceCategory = toEnum(ServiceCategory, category);
      const serviceStatus = toEnum(ServiceStatus, status);

      const { services, total } = await ServiceSvc.getAllServices({
        ...(ownerId && { ownerId: String(ownerId) }),
        ...(serviceCategory && { category: serviceCategory }),
        ...(serviceStatus && { status: serviceStatus }),
        ...(city && { city: String(city) }),
        page: page ? Number(page) : undefined,
        limit: limit ? Math.min(Number(limit), 50) : undefined,
      });

      return res.status(200).json({ services, total });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ message: err.message || err });
    }
  }

  // Public browse for the search page — item-level pagination (city matches the
  // owner's city, price filters the item itself; only serviceFoxer-owned services).
  static async browseServices(req: Request, res: Response) {
    try {
      const { city, maxPrice, page, limit } = req.query;
      const parsedLimit = limit ? Math.min(Number(limit), 50) : 10;
      const parsedPage = page ? Number(page) : 1;

      const { services, total } = await ServiceSvc.browseServices({
        ...(city && { ownerCity: String(city) }),
        ...(maxPrice && { maxPrice: Number(maxPrice) }),
        page: parsedPage,
        limit: parsedLimit,
      });

      return res.status(200).json({
        success: true,
        data: services,
        pagination: {
          page: parsedPage,
          limit: parsedLimit,
          total,
          totalPages: totalPages(total, parsedLimit),
        },
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
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
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(404).json({ message: err.message || err });
    }
  }

  static async updateService(req: Request, res: Response) {
    const schema = Joi.object<UpdateServicePayload>({
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

      const ownerId = req.user?.userId;
      if (!ownerId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const service = await ServiceSvc.updateService(
        String(id),
        String(ownerId),
        value,
      );
      announceAdminQueueChanged();
      return res
        .status(200)
        .json({ message: "Service updated successfully", service });
    } catch (e: unknown) {
      const err = e as Error;
      const status = err.message.includes("Unauthorized") ? 403 : 400;
      return res.status(status).json({ message: err.message || err });
    }
  }

  static async deleteService(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const requesterId = req.user?.userId;

      if (!requesterId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const result = await ServiceSvc.deleteService(
        String(id),
        String(requesterId),
      );
      announceAdminQueueChanged();
      return res.status(200).json(result);
    } catch (e: unknown) {
      const err = e as Error;
      const status = err.message.includes("authorized") ? 403 : 400;
      return res.status(status).json({ message: err.message || err });
    }
  }

}
