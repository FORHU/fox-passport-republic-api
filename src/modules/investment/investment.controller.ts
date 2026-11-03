import { NextFunction, Request, Response } from "express";
import Joi from "joi";
import { InvestmentType, InventoryCategory } from "@prisma/client";
import InvestmentSvc from "./investment.service";
import { unauthorized } from "../../utils/errors";
import { quantityJoi } from "../../utils/limits";
import { sendValidationError, VALIDATE_ALL } from "../../utils/validation";

const INVENTORY_CATEGORIES = [
  "furniture_seating",
  "tables_staging",
  "audio_visual",
  "lighting_rigging",
  "power_climate",
  "decor_props",
  "other",
];

// Equipment Details rules, shared by create and edit. Kept in step with the web
// wizard's features/investment/utils/wizardValidation.ts.
const titleJoi = () =>
  Joi.string().trim().min(3).max(120).messages({
    "any.required": "Enter a title of at least 3 characters.",
    "string.empty": "Enter a title of at least 3 characters.",
    "string.min": "Enter a title of at least 3 characters.",
    "string.max": "Titles can be up to 120 characters.",
  });

const descriptionJoi = () =>
  Joi.string().trim().min(10).max(2000).messages({
    "any.required": "Add a description of at least 10 characters.",
    "string.empty": "Add a description of at least 10 characters.",
    "string.min": "Add a description of at least 10 characters.",
    "string.max": "Descriptions can be up to 2,000 characters.",
  });

const categoryJoi = () =>
  Joi.string()
    .valid(...INVENTORY_CATEGORIES)
    .messages({
      "any.required": "Choose a category.",
      "any.only": "Choose one of the listed categories.",
    });

const quantityTotalJoi = () =>
  quantityJoi().messages({
    "any.required": "Enter how many units are available.",
  });

// Optional text: a blank value counts as not given.
const optionalTextJoi = () => Joi.string().trim().empty("");

export default class InvestmentCtrl {
  // POST /v1/investments
  static async createInvestment(req: Request, res: Response) {
    const isPhysical = { is: "physical_inventory", then: Joi.required() };
    const schema = Joi.object({
      type: Joi.string()
        .valid(
          "physical_inventory",
          "financial_capital",
          "venue_equity",
          "event_sponsorship",
        )
        .optional()
        .default("physical_inventory"),
      title: titleJoi().required(),
      description: descriptionJoi().required(),
      // Physical inventory must say what and how many; other types keep the old defaults.
      inventoryCategory: categoryJoi().when("type", {
        ...isPhysical,
        otherwise: Joi.optional().default("furniture_seating"),
      }),
      quantityTotal: quantityTotalJoi().when("type", {
        ...isPhysical,
        otherwise: Joi.optional().default(1),
      }),
      itemCondition: optionalTextJoi(),
      monetaryValue: Joi.number().min(0).optional().default(0),
      usageTerms: optionalTextJoi(),
      dailyRentalRate: Joi.number().min(0).optional(),
      revenueSharePercent: Joi.number().min(0).max(100).optional(),
      address: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().optional(),
      lat: Joi.number().min(-90).max(90).optional(),
      lng: Joi.number().min(-180).max(180).optional(),
      deliveryRadiusKm: Joi.number().positive().optional(),
      transportPolicy: Joi.string()
        .valid("self_pickup", "partner_delivers_free", "partner_delivers_fee")
        .optional(),
      targetVenueId: Joi.string().uuid().optional(),
      targetEventId: Joi.string().uuid().optional(),
      mediaUrls: Joi.array().items(Joi.string().uri()).optional(),
      broadcastToFeed: Joi.boolean().optional().default(true),
    });

    const { error, value } = schema.validate(req.body, VALIDATE_ALL);
    if (error) return sendValidationError(res, error, { success: true });

    try {
      const partnerId = req.user?.userId;
      if (!partnerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const investment = await InvestmentSvc.createInvestment(partnerId, value);
      return res.status(201).json({ success: true, data: investment });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // GET /v1/investments
  static async getInvestments(req: Request, res: Response) {
    try {
      const type = req.query.type as InvestmentType | undefined;
      const category = req.query.category as InventoryCategory | undefined;
      const partnerId = req.query.partnerId as string | undefined;
      // Soft-deleted rows are never listable.
      const status =
        req.query.status === "deleted"
          ? undefined
          : (req.query.status as string | undefined);
      const country = req.query.country as string | undefined;
      const city = req.query.city as string | undefined;
      const limit = Number(req.query.limit) || 20;
      const page = Number(req.query.page) || 1;

      const result = await InvestmentSvc.getInvestments({
        type,
        category,
        partnerId,
        status,
        country,
        city,
        limit,
        page,
      });

      return res.status(200).json({
        success: true,
        data: result.investments,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // GET /v1/investments/map
  static async getInvestmentsOnMap(req: Request, res: Response) {
    try {
      const type = req.query.type as InvestmentType | undefined;
      const category = req.query.category as InventoryCategory | undefined;
      const country = req.query.country as string | undefined;

      const minLat = req.query.minLat ? Number(req.query.minLat) : undefined;
      const maxLat = req.query.maxLat ? Number(req.query.maxLat) : undefined;
      const minLng = req.query.minLng ? Number(req.query.minLng) : undefined;
      const maxLng = req.query.maxLng ? Number(req.query.maxLng) : undefined;

      const bounds =
        minLat != null && maxLat != null && minLng != null && maxLng != null
          ? { minLat, maxLat, minLng, maxLng }
          : undefined;

      const pins = await InvestmentSvc.getInvestmentsOnMap({
        type,
        category,
        country,
        bounds,
      });

      return res.status(200).json({ success: true, data: pins });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // GET /v1/investments/nearby-for-venue/:venueId
  static async getNearbyInventoryForVenue(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      const category = req.query.category as InventoryCategory | undefined;
      const maxRadiusKm = req.query.radius ? Number(req.query.radius) : 50;

      const nearby = await InvestmentSvc.getNearbyInventoryForVenue({
        venueId,
        category,
        maxRadiusKm,
      });

      return res.status(200).json({ success: true, data: nearby });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(404).json({ success: false, message: err.message });
    }
  }

  // GET /v1/investments/:id
  static async getInvestmentById(req: Request, res: Response) {
    try {
      const investment = await InvestmentSvc.getInvestmentById(req.params.id);
      return res.status(200).json({ success: true, data: investment });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(404).json({ success: false, message: err.message });
    }
  }

  // PATCH /v1/investments/:id
  static async updateInvestment(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const schema = Joi.object({
      title: titleJoi(),
      description: descriptionJoi(),
      inventoryCategory: categoryJoi(),
      quantityTotal: quantityTotalJoi(),
      itemCondition: optionalTextJoi(),
      usageTerms: optionalTextJoi(),
      address: Joi.string(),
      city: Joi.string(),
      state: Joi.string(),
      country: Joi.string(),
      lat: Joi.number().min(-90).max(90),
      lng: Joi.number().min(-180).max(180),
      deliveryRadiusKm: Joi.number().positive(),
      transportPolicy: Joi.string().valid(
        "self_pickup",
        "partner_delivers_free",
        "partner_delivers_fee",
      ),
      mediaUrls: Joi.array().items(Joi.string().uri()),
    }).min(1);

    const { error, value } = schema.validate(req.body, VALIDATE_ALL);
    if (error) return sendValidationError(res, error, { success: true });

    try {
      const requesterId = req.user?.userId;
      if (!requesterId) throw unauthorized();
      const investment = await InvestmentSvc.updateInvestment(
        req.params.id,
        requesterId,
        value,
      );
      return res.status(200).json({ success: true, data: investment });
    } catch (e) {
      next(e);
    }
  }

  // PATCH /v1/investments/:id/cancel
  static async cancelInvestment(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const requesterId = req.user?.userId;
      if (!requesterId) throw unauthorized();
      const investment = await InvestmentSvc.cancelInvestment(
        req.params.id,
        requesterId,
      );
      return res.status(200).json({ success: true, data: investment });
    } catch (e) {
      next(e);
    }
  }

  // PATCH /v1/investments/:id/archive
  static async archiveInvestment(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const requesterId = req.user?.userId;
      if (!requesterId) throw unauthorized();
      const investment = await InvestmentSvc.archiveInvestment(
        req.params.id,
        requesterId,
      );
      return res.status(200).json({ success: true, data: investment });
    } catch (e) {
      next(e);
    }
  }

  // DELETE /v1/investments/:id (soft delete)
  static async deleteInvestment(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const requesterId = req.user?.userId;
      if (!requesterId) throw unauthorized();
      const investment = await InvestmentSvc.deleteInvestment(
        req.params.id,
        requesterId,
      );
      return res.status(200).json({ success: true, data: investment });
    } catch (e) {
      next(e);
    }
  }
}
