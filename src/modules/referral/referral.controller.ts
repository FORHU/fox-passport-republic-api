import { Request, Response } from "express";
import { badRequest, sendServerError } from "../../utils/errors";
import ReferralSvc from "./referral.service";

export class ReferralCtrl {
  /**
   * GET /api/v1/referrals/me
   * The caller's code to share (made on first ask), how many friends used it,
   * and whether they can still enter a friend's code.
   */
  static async getMine(req: Request, res: Response) {
    try {
      const data = await ReferralSvc.getMine(req.user!.userId);
      return res.status(200).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /**
   * POST /api/v1/referrals/apply   { "code": "ABCD2345" }
   * Attaches a friend's code to the caller. Pays nothing by itself.
   */
  static async apply(req: Request, res: Response) {
    try {
      const code = (req.body as { code?: unknown } | undefined)?.code;
      if (typeof code !== "string" || code.trim() === "") {
        throw badRequest("Enter a referral code.");
      }
      const data = await ReferralSvc.apply(req.user!.userId, code);
      return res.status(201).json({ success: true, data });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}

export default ReferralCtrl;
