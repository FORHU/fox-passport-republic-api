import { Request, Response } from "express";
import { UserPath } from "@prisma/client";
import { sendServerError, AppError } from "../../utils/errors";
import { toUserPath } from "../../utils/enums";
import RewardService from "./reward.service";

export default class RewardCtrl {
  /**
   * GET /api/v1/rewards/me
   * Returns authenticated user's wallet overview (spendable coins, level, rank, transaction history).
   */
  static async getMyWallet(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const pathParam = req.query.path as string | undefined;
      const path = toUserPath(pathParam, UserPath.user);

      const wallet = await RewardService.getWallet(userId, path);
      return res.status(200).json({ success: true, data: wallet });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /**
   * GET /api/v1/rewards/catalog
   * Returns active reward catalog options with canAfford and levelQualified indicators.
   */
  static async getCatalog(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const targetAudience = req.query.targetAudience as string | undefined;
      const pathParam = req.query.path as string | undefined;
      const path = toUserPath(pathParam, UserPath.user);

      const catalog = await RewardService.getCatalog(
        userId,
        targetAudience,
        path,
      );
      return res.status(200).json({ success: true, data: catalog });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }

  /**
   * POST /api/v1/rewards/redeem
   * Atomically checks balance and redeems a reward option, issuing an owner-scoped voucher.
   */
  static async redeemReward(req: Request, res: Response) {
    try {
      const userId = req.user!.userId;
      const { rewardId, path: pathParam } = req.body;

      if (!rewardId) {
        throw new AppError("rewardId is required", 400);
      }

      const path = toUserPath(pathParam, UserPath.user);

      const result = await RewardService.redeem({
        userId,
        rewardId,
        path,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      return sendServerError(res, e, { success: false });
    }
  }
}
