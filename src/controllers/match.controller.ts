import { Request, Response } from "express";
import MatchSvc from "../services/match.service";
import PaymentSvc from "../services/payment.service";

export default class MatchController {
  static async createMatch(req: Request, res: Response) {
    try {
      const { foxerId, style, date, guestCount, requestContent, totalAmount } = req.body;
      const clientId = (req as any).user?.id; // Assuming auth middleware

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
        const clientId = (req as any).user?.id;
        // Logic to fetch user's match requests
        res.status(200).json({ matches: [] }); // Placeholder
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
  }
}
