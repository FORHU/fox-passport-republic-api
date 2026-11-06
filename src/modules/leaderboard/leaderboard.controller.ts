import { Request, Response } from "express";
import { sendServerError } from "../../utils/errors";
import LeaderboardService from "./leaderboard.service";
import {
  CitizenLeaderboardTab,
  FoxerLeaderboardTab,
} from "./leaderboard.types";

export class LeaderboardCtrl {
  /**
   * GET /api/v1/leaderboard/citizens
   * Query params:
   *  - tab: "this_month" | "all_time" | "my_city"
   *  - city: string (optional)
   */
  static async getCitizens(req: Request, res: Response) {
    try {
      const userId = req.user?.userId ?? null;
      const tab = (req.query.tab as CitizenLeaderboardTab) || "this_month";
      const city = req.query.city ? String(req.query.city) : undefined;

      const data = await LeaderboardService.getCitizenLeaderboard(
        userId,
        tab,
        city,
      );
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /**
   * GET /api/v1/leaderboard/foxers
   * Query params:
   *  - tab: "top_rated" | "most_booked" | "rising"
   *  - role: string (optional, e.g. "venueFoxer", "providerFoxer")
   *  - city: string (optional)
   */
  static async getFoxers(req: Request, res: Response) {
    try {
      const userId = req.user?.userId ?? null;
      const tab = (req.query.tab as FoxerLeaderboardTab) || "top_rated";
      const role = req.query.role ? String(req.query.role) : undefined;
      const city = req.query.city ? String(req.query.city) : undefined;

      const data = await LeaderboardService.getFoxerLeaderboard(
        userId,
        tab,
        role,
        city,
      );
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}

export default LeaderboardCtrl;
