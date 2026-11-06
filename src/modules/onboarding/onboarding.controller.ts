import { Request, Response } from "express";
import { sendServerError } from "../../utils/errors";
import OnboardingSvc from "./onboarding.service";

export default class OnboardingCtrl {
  /**
   * GET /api/v1/onboarding
   * The onboarding steps the signed-in account has finished.
   */
  static async list(req: Request, res: Response) {
    try {
      const steps = await OnboardingSvc.listCompleted(req.user!.userId);
      return res.status(200).json({ success: true, data: { steps } });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /**
   * POST /api/v1/onboarding/:step
   * Marks a step finished (once) and pays its reward through RewardService.
   */
  static async complete(req: Request, res: Response) {
    try {
      const result = await OnboardingSvc.complete(
        req.user!.userId,
        String(req.params.step),
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}
