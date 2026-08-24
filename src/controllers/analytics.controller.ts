import { Request, Response } from "express";
import PassportSvc from "../services/passport.service";
import AnalyticsSvc from "../services/analytics.service";

export default class AnalyticsCtrl {
  static async getEventStats(req: Request, res: Response) {
    try {
      const userId = req.user?.userId as string;
      const hasAnalyticsPro = await PassportSvc.hasPerk(
        userId,
        "analytics_pro",
      );
      if (!hasAnalyticsPro) {
        return res.status(403).json({
          success: false,
          message:
            "Analytics Pro perk required — unlock at Event Foxer Level 5",
        });
      }
      const stats = await AnalyticsSvc.getEventStats(userId);
      return res.status(200).json({ success: true, data: stats });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}
