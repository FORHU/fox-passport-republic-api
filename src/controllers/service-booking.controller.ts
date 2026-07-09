import { Request, Response } from "express";
import Joi from "joi";
import ServiceBookingSvc from "../services/service-booking.service";

export default class ServiceBookingCtrl {
  // POST /service/bookings
  static async create(req: Request, res: Response) {
    const schema = Joi.object({
      serviceId: Joi.string().required(),
      scheduledDate: Joi.string().isoDate().required(),
      endDate: Joi.string().isoDate().optional(),
      guestCount: Joi.number().integer().min(1).optional(),
      location: Joi.string().required(),
      notes: Joi.string().allow("").optional(),
      // NOTE: totalAmount intentionally not accepted — always server-computed.
    });

    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    try {
      const userId = req.user!.userId;
      const booking = await ServiceBookingSvc.create({ ...value, userId });
      return res.status(201).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // GET /service/bookings/availability?serviceId=xxx
  static async getAvailability(req: Request, res: Response) {
    const { serviceId } = req.query as Record<string, string>;
    if (!serviceId)
      return res
        .status(400)
        .json({ success: false, message: "serviceId is required" });
    try {
      const data = await ServiceBookingSvc.getAvailability(serviceId);
      return res.status(200).json({ success: true, data });
    } catch (err: any) {
      return res.status(404).json({ success: false, message: err.message });
    }
  }

  // GET /service/bookings
  static async getAll(req: Request, res: Response) {
    try {
      const { userId, ownerId, status } = req.query as Record<string, string>;
      const bookings = await ServiceBookingSvc.getAll({
        userId,
        ownerId,
        status,
      });
      return res.status(200).json({ success: true, data: bookings });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // GET /service/bookings/:id
  static async getById(req: Request, res: Response) {
    try {
      const booking = await ServiceBookingSvc.getById(req.params.id);
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(404).json({ success: false, message: err.message });
    }
  }

  // POST /service/bookings/:id/confirm
  static async confirmPayment(req: Request, res: Response) {
    const schema = Joi.object({
      transactionId: Joi.string().required(),
      method: Joi.string().required(),
      amount: Joi.number().min(0).optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    try {
      const booking = await ServiceBookingSvc.confirmPayment(
        req.params.id,
        value.transactionId,
        value.method,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /service/bookings/:id/status
  static async updateStatus(req: Request, res: Response) {
    const schema = Joi.object({
      status: Joi.string()
        .valid("pending", "confirmed", "active", "completed", "cancelled")
        .required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    try {
      const booking = await ServiceBookingSvc.updateStatus(
        req.params.id,
        value.status,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // DELETE /service/bookings/:id
  static async cancel(req: Request, res: Response) {
    try {
      const booking = await ServiceBookingSvc.cancel(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /service/bookings/:id/confirm-arrival
  static async confirmArrival(req: Request, res: Response) {
    try {
      const booking = await ServiceBookingSvc.confirmArrival(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /service/bookings/:id/dispute
  static async dispute(req: Request, res: Response) {
    const { reason } = req.body;
    try {
      const booking = await ServiceBookingSvc.dispute(
        req.params.id,
        req.user!.userId,
        reason,
      );
      return res.status(200).json({ success: true, data: booking });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }
}
