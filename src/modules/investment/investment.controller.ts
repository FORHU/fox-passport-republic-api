import { Request, Response } from "express";
import Joi from "joi";
import InvestmentSvc from "./investment.service";

export default class InvestmentCtrl {
  // POST /v1/investments
  static async createInvestment(req: Request, res: Response) {
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
      title: Joi.string().min(3).max(120).required(),
      description: Joi.string().min(10).max(2000).required(),
      inventoryCategory: Joi.string()
        .valid(
          "furniture_seating",
          "tables_staging",
          "audio_visual",
          "lighting_rigging",
          "power_climate",
          "decor_props",
          "other",
        )
        .optional()
        .default("furniture_seating"),
      quantityTotal: Joi.number().integer().min(1).optional().default(1),
      itemCondition: Joi.string().optional(),
      monetaryValue: Joi.number().min(0).optional().default(0),
      usageTerms: Joi.string().optional(),
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

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.details[0].message });
    }

    try {
      const partnerId = req.user?.userId;
      if (!partnerId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
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
      const type = req.query.type as any;
      const category = req.query.category as any;
      const partnerId = req.query.partnerId as string | undefined;
      const status = req.query.status as string | undefined;
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
      const type = req.query.type as any;
      const category = req.query.category as any;
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
      const category = req.query.category as any;
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
}
