import { Request, Response } from "express";
import PayoutSvc from "./payout.service";

export default class PayoutCtrl {
  // GET /v1/payouts/me
  static async getMyPayouts(req: Request, res: Response) {
    try {
      const providerId = req.user!.userId;
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;

      const result = await PayoutSvc.getPayoutsForProvider(
        providerId,
        page,
        limit,
      );

      return res.status(200).json({
        success: true,
        data: result.payouts,
        pagination: result.pagination,
        totals: result.totals,
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
