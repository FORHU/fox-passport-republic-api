import { Request, Response } from "express";
import { sendServerError } from "../../utils/errors";
import LeaderboardSvc from "./leaderboard.service";

function one(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default class LeaderboardCtrl {
  /**
   * GET /api/v1/leaderboard/foxers?role=&city=&tab=&limit=
   * The Foxer leaderboard for a role, with the caller's own place pinned.
   */
  static async foxers(req: Request, res: Response) {
    try {
      const limit = Number(one(req.query.limit));
      const board = await LeaderboardSvc.foxers({
        viewerId: req.user!.userId,
        role: one(req.query.role) ?? "",
        tab: one(req.query.tab),
        city: one(req.query.city),
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return res.status(200).json({ success: true, data: board });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /**
   * GET /api/v1/leaderboard/citizens?tab=month|all|city&limit=
   * The citizen leaderboard, with the caller's own place pinned.
   */
  static async citizens(req: Request, res: Response) {
    try {
      const limit = Number(one(req.query.limit));
      const board = await LeaderboardSvc.citizens({
        viewerId: req.user!.userId,
        tab: one(req.query.tab),
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      return res.status(200).json({ success: true, data: board });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}
