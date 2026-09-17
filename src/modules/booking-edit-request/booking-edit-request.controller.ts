import { Request, Response } from "express";
import Joi from "joi";
import BookingEditRequestSvc from "./booking-edit-request.service";

export default class BookingEditRequestCtrl {
  // POST /booking-edit-requests
  static async create(req: Request, res: Response) {
    const schema = Joi.object({
      bookingKind: Joi.string().valid("asset", "service").required(),
      bookingId: Joi.string().required(),
      proposedQuantity: Joi.number().integer().min(1).optional(),
      proposedGuestCount: Joi.number().integer().min(1).optional(),
      proposedStartDate: Joi.string().isoDate().optional(),
      proposedEndDate: Joi.string().isoDate().optional(),
      reason: Joi.string().allow("").optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    try {
      const request = await BookingEditRequestSvc.create({
        ...value,
        requestedById: req.user!.userId,
      });
      return res.status(201).json({ success: true, data: request });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // GET /booking-edit-requests?bookingKind=&bookingId=
  static async getForBooking(req: Request, res: Response) {
    const { bookingKind, bookingId } = req.query as Record<string, string>;
    if (bookingKind !== "asset" && bookingKind !== "service") {
      return res
        .status(400)
        .json({ success: false, message: "bookingKind must be asset or service" });
    }
    if (!bookingId) {
      return res
        .status(400)
        .json({ success: false, message: "bookingId is required" });
    }

    try {
      const request = await BookingEditRequestSvc.getForBooking(
        bookingKind,
        bookingId,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: request });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /booking-edit-requests/:id/approve
  static async approve(req: Request, res: Response) {
    try {
      const request = await BookingEditRequestSvc.approve(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: request });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /booking-edit-requests/:id/decline
  static async decline(req: Request, res: Response) {
    const { declineReason } = req.body;
    try {
      const request = await BookingEditRequestSvc.decline(
        req.params.id,
        req.user!.userId,
        declineReason,
      );
      return res.status(200).json({ success: true, data: request });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // PATCH /booking-edit-requests/:id/withdraw
  static async withdraw(req: Request, res: Response) {
    try {
      const request = await BookingEditRequestSvc.withdraw(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: request });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  // POST /booking-edit-requests/:id/confirm-delta-payment
  static async confirmDeltaPayment(req: Request, res: Response) {
    try {
      const request = await BookingEditRequestSvc.confirmDeltaPayment(
        req.params.id,
        req.user!.userId,
      );
      return res.status(200).json({ success: true, data: request });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }
}
