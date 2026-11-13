import { Request, Response } from "express";
import { sendServerError } from "../../utils/errors";
import DailyLoginSvc from "./daily-login.service";

export class DailyLoginCtrl {
  /**
   * GET /api/v1/rewards/daily-login
   * Today's daily login for the caller: claimed or not, what it pays, the
   * streak and the monthly cap. Read only.
   */
  static async getStatus(req: Request, res: Response) {
    try {
      const data = await DailyLoginSvc.getStatus(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /**
   * POST /api/v1/rewards/daily-login
   * Claims today's Tokens. Idempotent per person and Manila day.
   */
  static async claim(req: Request, res: Response) {
    try {
      const data = await DailyLoginSvc.claim(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}

export default DailyLoginCtrl;
