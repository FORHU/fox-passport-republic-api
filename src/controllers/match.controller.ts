import { Request, Response } from "express";
import Joi from "joi";
import MatchSvc from "../services/match.service";
import PaymentSvc from "../services/payment.service";

export default class MatchController {
  static async createMatch(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        style: Joi.string().allow("", null).default("Own idea"),
        foxerId: Joi.string().required(),
        date: Joi.date().iso().required(),
        guestCount: Joi.number().integer().min(1).required(),
        requestContent: Joi.string().allow("", null).optional(),
        totalAmount: Joi.number().min(0).optional(),
        venueId: Joi.string().uuid().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const {
        style,
        date,
        guestCount,
        requestContent,
        totalAmount,
        venueId,
        foxerId,
      } = value;
      const clientId = req.user?.userId;

      if (!clientId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { eventRequest, booking } = await MatchSvc.createMatchRequest({
        clientId,
        foxerId,
        style,
        date: new Date(date),
        guestCount,
        requestContent,
        totalAmount,
        venueId,
      });

      // Only create a Stripe payment intent when there's a known amount to charge
      if (eventRequest.totalAmount.gt(0)) {
        const { clientSecret } = await PaymentSvc.createPaymentIntent({
          amount: eventRequest.totalAmount.toNumber(),
          currency: "php",
          bookingId: booking.id,
          description: `Match Request: ${style}`,
        });
        return res.status(201).json({
          message: "Match request created",
          bookingId: booking.id,
          clientSecret,
        });
      }

      res.status(201).json({
        message: "Match request created",
        bookingId: booking.id,
        clientSecret: null,
      });
    } catch (e: unknown) {
      const error = e as Error;
      res.status(500).json({ message: error.message });
    }
  }

  static async getMyMatches(req: Request, res: Response) {
    try {
      const clientId = req.user?.userId;
      if (!clientId) return res.status(401).json({ message: "Unauthorized" });
      const matches = await MatchSvc.getMyMatches(clientId);
      res.status(200).json({ success: true, data: matches });
    } catch (e: unknown) {
      const error = e as Error;
      res.status(500).json({ message: error.message });
    }
  }

  static async acceptMatch(req: Request, res: Response) {
    try {
      const foxerId = req.user?.userId;
      if (!foxerId) return res.status(401).json({ message: "Unauthorized" });
      await MatchSvc.acceptMatch(req.params.id, foxerId);
      res.status(200).json({ success: true, message: "Match accepted" });
    } catch (e: unknown) {
      const error = e as Error;
      const status =
        error.message === "Unauthorized"
          ? 403
          : error.message === "Match not found"
            ? 404
            : 400;
      res.status(status).json({ message: error.message });
    }
  }

  static async declineMatch(req: Request, res: Response) {
    try {
      const foxerId = req.user?.userId;
      if (!foxerId) return res.status(401).json({ message: "Unauthorized" });
      const { reason } = req.body;
      await MatchSvc.declineMatch(req.params.id, foxerId, reason);
      res.status(200).json({ success: true, message: "Match declined" });
    } catch (e: unknown) {
      const error = e as Error;
      const status =
        error.message === "Unauthorized"
          ? 403
          : error.message === "Match not found"
            ? 404
            : 400;
      res.status(status).json({ message: error.message });
    }
  }

  static async getFoxerClientInbox(req: Request, res: Response) {
    try {
      const foxerId = req.user?.userId;
      if (!foxerId) return res.status(401).json({ message: "Unauthorized" });
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await MatchSvc.getFoxerClientInbox(foxerId, limit, offset);
      res.status(200).json({ success: true, ...result });
    } catch (e: unknown) {
      const error = e as Error;
      res.status(500).json({ message: error.message });
    }
  }
}
