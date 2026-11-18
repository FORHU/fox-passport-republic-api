import { Request, Response } from "express";
import { sendServerError } from "../../utils/errors";
import MilestoneSvc from "./milestone.service";

export class MilestoneCtrl {
  /**
   * GET /api/v1/milestones/me
   * The caller's milestones and challenges with live progress. Read only.
   */
  static async getMine(req: Request, res: Response) {
    try {
      const data = await MilestoneSvc.getMine(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}

export default MilestoneCtrl;
