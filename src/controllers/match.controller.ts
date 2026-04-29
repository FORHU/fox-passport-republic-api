import { Request, Response } from "express";
import MatchSvc from "../services/match.service";
import PaymentSvc from "../services/payment.service";

export default class MatchController {
  static async createMatch(req: Request, res: Response) {
    try {
      const { style, date, guestCount, requestContent, totalAmount } = req.body;
      const foxerId = String(req.body.foxerId); // coerce to string — frontend may send numeric IDs
      const clientId = (req as any).user?.userId || (req as any).user?.id;

      if (!clientId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { booking } = await MatchSvc.createMatchRequest({
        clientId,
        foxerId,
        style,
        date: new Date(date),
        guestCount,
        requestContent,
        totalAmount
      });

      // Create Payment Intent immediately
      const { clientSecret } = await PaymentSvc.createPaymentIntent({
        amount: totalAmount,
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
