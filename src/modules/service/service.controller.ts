import { Request, Response } from "express";
import { maxPriceFilter } from "../../utils/price-filter";
import Joi from "joi";
import { totalPages } from "../../utils/pagination";
import { searchQuery } from "../../utils/search-terms";
import ServiceSvc from "./service.service";
import { BillingRate, ServiceStatus, ServiceCategory } from "@prisma/client";
import { toEnum } from "../../utils/enums";
import { announceAdminQueueChanged } from "../../infrastructure/socket/invalidate";
import { can, isPerformerServiceCategory } from "../../types/permissions";
import { MAX_LISTING_IMAGES } from "../../utils/listing-images";
import { descriptionJoi, nameJoi, priceJoi } from "../../utils/limits";
import { AppError, fromPrisma, sendAppError } from "../../utils/errors";

/**
 * The route-level gate (`requirePermissionAny(["service:manage",
 * "performer:manage"])`) only asks whether the caller holds *either*
 * permission. This asks the specific one `category` requires, so a caller
 * holding only one of the two cannot create/retarget a listing into the
 * other's categories. (Providers hold both.)
 */
function assertCanManageCategory(
  req: Request,
  category: ServiceCategory,
): string | null {
  const required = isPerformerServiceCategory(category)
    ? "performer:manage"
    : "service:manage";
  if (!can(req.user, required)) {
    return "You must be an approved Provider to manage this category";
  }
  return null;
}

/**
 * Answers a failed request. An AppError, or a Prisma error (an unknown image
 * id, a value out of range), gets its safe message, never Prisma's own text
 * with the model and columns in it. A plain Error comes from the service layer
 * ("Service not found") and keeps its message and the status the route gave it.
 */
function fail(
  res: Response,
  e: unknown,
  status: number | ((message: string) => number),
  opts: { success?: boolean } = {},
) {
  const safe = e instanceof AppError ? e : fromPrisma(e);
  if (safe) return sendAppError(res, safe, opts);
  const message = (e as Error)?.message ?? "Something went wrong";
  return res
    .status(typeof status === "function" ? status(message) : status)
    .json({
      ...(opts.success ? { success: false } : {}),
      message,
    });
}

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
  imgIds?: string[];
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
      name: nameJoi().required(),
      // Empty is fine for a draft; the service requires one past draft.
      description: descriptionJoi().allow("").optional(),
      city: Joi.string().required(),
      state: Joi.string().optional(),
      country: Joi.string().required(),
      lat: Joi.number().optional(),
      lng: Joi.number().optional(),
      isWillingToTravel: Joi.boolean().optional(),
      tags: Joi.array().items(Joi.string().trim().min(1)).optional(),
      price: priceJoi().required(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string()
        .valid(...Object.values(BillingRate))
        .optional(),
      // Empty is fine for a draft; ServiceSvc requires an image past draft.
      imgIds: Joi.array()
        .items(Joi.string())
        .max(MAX_LISTING_IMAGES)
        .default([]),
      status: Joi.string()
        .valid(...Object.values(ServiceStatus))
        .optional(),
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

      const categoryError = assertCanManageCategory(req, value.category);
      if (categoryError) {
        return res.status(403).json({ message: categoryError });
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
      return fail(res, e, 400);
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
      return fail(res, e, 500);
    }
  }

  // Public browse for the search page — item-level pagination (city matches the
  // owner's city, price filters the item itself; only Provider-owned services).
  static async browseServices(req: Request, res: Response) {
    try {
      const { city, maxPrice, page, limit, q, category } = req.query;
      const parsedLimit = limit ? Math.min(Number(limit), 50) : 10;
      const parsedPage = page ? Number(page) : 1;
      const term = searchQuery(q);
      // An unrecognised category drops the filter instead of reaching Prisma.
      const categoryFilter = toEnum(ServiceCategory, category);

      const { services, total } = await ServiceSvc.browseServices({
        ...(city && { ownerCity: String(city) }),
        maxPrice: maxPriceFilter(maxPrice),
        ...(term && { q: term }),
        ...(categoryFilter && { category: categoryFilter }),
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
      return fail(res, e, 500, { success: true });
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
      return fail(res, e, 404);
    }
  }

  static async updateService(req: Request, res: Response) {
    const schema = Joi.object<UpdateServicePayload>({
      category: Joi.string()
        .valid(...Object.values(ServiceCategory))
        .optional(),
      name: nameJoi().optional(),
      description: descriptionJoi().optional(),
      city: Joi.string().optional(),
      state: Joi.string().allow("").optional(),
      country: Joi.string().optional(),
      lat: Joi.number().optional(),
      lng: Joi.number().optional(),
      isWillingToTravel: Joi.boolean().optional(),
      tags: Joi.array().items(Joi.string().trim().min(1)).optional(),
      price: priceJoi().optional(),
      currency: Joi.string().trim().uppercase().length(3).optional(),
      billingRate: Joi.string()
        .valid(...Object.values(BillingRate))
        .optional(),
      status: Joi.string()
        .valid(...Object.values(ServiceStatus))
        .optional(),
      // Replaces the listing's images; omit it to leave them as they are.
      imgIds: Joi.array()
        .items(Joi.string())
        .min(1)
        .max(MAX_LISTING_IMAGES)
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

      if (value.category) {
        const categoryError = assertCanManageCategory(req, value.category);
        if (categoryError) {
          return res.status(403).json({ message: categoryError });
        }
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
      return fail(res, e, (m) => (m.includes("Unauthorized") ? 403 : 400));
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
      return fail(res, e, (m) => (m.includes("authorized") ? 403 : 400));
    }
  }
}
