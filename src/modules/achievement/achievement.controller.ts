import { Request, Response } from "express";
import { sendServerError } from "../../utils/errors";
import { AchievementSvc } from "./achievement.service";

export class AchievementCtrl {
  /**
   * GET /api/v1/achievements/me
   * Returns personal citizen and Foxer achievements with live progress,
   * target thresholds, and rewards.
   */
  static async getMyAchievements(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const data = await AchievementSvc.getUserAchievements(userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /**
   * GET /api/v1/achievements/user/:userId
   * Public profile achievement showcase.
   */
  static async getPublicAchievements(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const data = await AchievementSvc.getUserAchievements(userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}
