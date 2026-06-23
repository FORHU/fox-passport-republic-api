import { Request, Response } from "express";
import Joi from "joi";
import AssetBookingSvc from "../services/asset-booking.service";

export default class AssetBookingCtrl {
  // POST /asset/bookings
  static async create(req: Request, res: Response) {
    const schema = Joi.object({
      assetId: Joi.string().required(),
      startDate: Joi.string().isoDate().required(),
      endDate: Joi.string().isoDate().required(),
      quantity: Joi.number().integer().min(1).required(),
      fulfillmentType: Joi.string().valid("delivery", "pickup").required(),
      deliveryAddress: Joi.string().when("fulfillmentType", {
        is: "delivery",
        then: Joi.required(),
        otherwise: Joi.optional().allow(""),
      }),
      notes: Joi.string().allow("").optional(),
      // NOTE: totalAmount intentionally not accepted — always server-computed.
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    try {
      const userId = req.user!.userId;
      const booking = await AssetBookingSvc.create({ ...value, userId });
      return res.status(201).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // GET /asset/bookings/availability?assetId=xxx
  static async getAvailability(req: Request, res: Response) {
    const { assetId } = req.query as Record<string, string>;
    if (!assetId) return res.status(400).json({ success: false, message: "assetId is required" });
    try {
      const data = await AssetBookingSvc.getAvailability(assetId);
      return res.status(200).json({ success: true, data });
    } catch (err: any) {
      return res.status(404).json({ success: false, message: err.message });
    }
  }

  // GET /asset/bookings
  static async getAll(req: Request, res: Response) {
    try {
      const { userId, ownerId, status } = req.query as Record<string, string>;
      const bookings = await AssetBookingSvc.getAll({ userId, ownerId, status });
      return res.status(200).json({ success: true, data: bookings });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // GET /asset/bookings/:id
  static async getById(req: Request, res: Response) {
    try {
      const booking = await AssetBookingSvc.getById(req.params.id);
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(404).json({ success: false, message: err.message });
    }
  }

  // POST /asset/bookings/:id/confirm
  static async confirmPayment(req: Request, res: Response) {
    const schema = Joi.object({
      transactionId: Joi.string().required(),
      method: Joi.string().required(),
      amount: Joi.number().min(0).optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    try {
      const booking = await AssetBookingSvc.confirmPayment(
        req.params.id,
        value.transactionId,
        value.method,
        req.user!.userId
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /asset/bookings/:id/status
  static async updateStatus(req: Request, res: Response) {
    const schema = Joi.object({
      status: Joi.string().valid("pending", "confirmed", "active", "completed", "cancelled").required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.message });

    try {
      const booking = await AssetBookingSvc.updateStatus(req.params.id, value.status, req.user!.userId);
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // DELETE /asset/bookings/:id
  static async cancel(req: Request, res: Response) {
    try {
      const booking = await AssetBookingSvc.cancel(req.params.id, req.user!.userId);
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /asset/bookings/:id/confirm-arrival
  static async confirmArrival(req: Request, res: Response) {
    try {
      const booking = await AssetBookingSvc.confirmArrival(req.params.id, req.user!.userId);
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /asset/bookings/:id/dispute
  static async dispute(req: Request, res: Response) {
    try {
      const booking = await AssetBookingSvc.dispute(req.params.id, req.user!.userId);
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
}
