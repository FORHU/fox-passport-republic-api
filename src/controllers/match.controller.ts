import { Request, Response } from "express";
import Joi from "joi";
import MatchSvc from "../services/match.service";
import PaymentSvc from "../services/payment.service";

export default class MatchController {
  static async createMatch(req: Request, res: Response) {
    try {
      const schema = Joi.object({
        style: Joi.string().required(),
        foxerId: Joi.string().required(),
        date: Joi.date().iso().required(),
        guestCount: Joi.number().integer().min(1).required(),
        requestContent: Joi.string().allow("", null).optional(),
        totalAmount: Joi.number().min(0).optional(),
        venueId: Joi.string().uuid().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) return res.status(400).json({ message: error.message });

      const { style, date, guestCount, requestContent, totalAmount, venueId } = value;
      const foxerId = value.foxerId;
      const clientId = (req as any).user?.userId || (req as any).user?.id;

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

      // Create Payment Intent immediately using server-computed totals
      const { clientSecret } = await PaymentSvc.createPaymentIntent({
        amount: eventRequest.totalAmount,
        currency: 'php',
        bookingId: booking.id,
        description: `Match Request: ${style}`
      });

      res.status(201).json({
        message: "Match request created",
        bookingId: booking.id,
        clientSecret
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }

  static async getMyMatches(req: Request, res: Response) {
    try {
      const clientId = (req as any).user?.id || (req as any).user?.userId;
      if (!clientId) return res.status(401).json({ message: "Unauthorized" });
      const matches = await MatchSvc.getMyMatches(clientId);
      res.status(200).json({ success: true, data: matches });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  }
}