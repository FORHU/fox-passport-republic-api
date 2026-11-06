import { Request, Response } from "express";
import { sendServerError } from "../../utils/errors";
import FoxerScoreService from "./foxer-score.service";

export default class FoxerScoreCtrl {
  /**
   * GET /api/v1/foxer-score/me
   * Foxer internal management console: returns complete Foxer Score (0-100),
   * component breakdown, and raw operational metrics.
   */
  static async getMyScore(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const scoreData = await FoxerScoreService.computeFoxerScore(userId);
      return res.status(200).json({ success: true, data: scoreData });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /**
   * GET /api/v1/foxer-score/:userId
   * Public profile reputation for citizens: returns star rating, review count,
   * responsiveness, cancellation rate, verified status, and earned badges/labels.
   */
  static async getFoxerReputation(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const publicData = await FoxerScoreService.getPublicReputation(userId);
      return res.status(200).json({ success: true, data: publicData });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}

