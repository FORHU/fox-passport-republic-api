import { Request, Response } from "express";
import { sendServerError } from "../../utils/errors";
import LeaderboardService from "./leaderboard.service";
import { FoxerLeaderboardTab } from "./leaderboard.types";

export class LeaderboardCtrl {
  /**
   * GET /api/v1/leaderboard/foxers
   * Query params:
   *  - tab: "top_rated" | "most_booked" | "rising"
   *  - role: string (optional, e.g. "venueFoxer", "providerFoxer")
   *  - city: string (optional)
   *  - specialty: string (optional): a Provider specialty slug; a Provider
   *    appears under each specialty they declared
   */
  static async getFoxers(req: Request, res: Response) {
    try {
      const userId = req.user?.userId ?? null;
      const tab = (req.query.tab as FoxerLeaderboardTab) || "top_rated";
      const role = req.query.role ? String(req.query.role) : undefined;
      const city = req.query.city ? String(req.query.city) : undefined;
      const specialty = req.query.specialty
        ? String(req.query.specialty)
        : undefined;

      const data = await LeaderboardService.getFoxerLeaderboard(
        userId,
        tab,
        role,
        city,
        specialty,
      );
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}

export default LeaderboardCtrl;
