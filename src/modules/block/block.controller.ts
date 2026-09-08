import { Request, Response } from "express";
import BlockService from "./block.service";

export default class BlockController {
  static async blockUser(req: Request, res: Response) {
    try {
      const blockerId = req.user?.userId;
      if (!blockerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { targetId } = req.body;
      if (!targetId) {
        return res
          .status(400)
          .json({ success: false, message: "Missing targetId" });
      }

      const result = await BlockService.blockUser(blockerId, targetId);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      return res
        .status(err.status ?? 400)
        .json({ success: false, message: err.message });
    }
  }

  static async unblockUser(req: Request, res: Response) {
    try {
      const blockerId = req.user?.userId;
      if (!blockerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { targetId } = req.params;
      const result = await BlockService.unblockUser(blockerId, targetId);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getStatus(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { userId: otherId } = req.params;
      const status = await BlockService.getStatus(userId, otherId);
      return res.status(200).json({ success: true, data: status });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getBlockedUsers(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const parsedPage = Number(req.query.page);
      const page = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage);
      const parsedLimit = Number(req.query.limit);
      const limit = Number.isNaN(parsedLimit)
        ? 20
        : Math.min(Math.max(1, parsedLimit), 50);

      const result = await BlockService.getBlockedUsers(userId, page, limit);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
