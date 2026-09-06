import { Request, Response } from "express";
import FollowService from "./follow.service";

export default class FollowController {
  static async toggleFollow(req: Request, res: Response) {
    try {
      const followerId = req.user?.userId;
      if (!followerId) {
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

      const result = await FollowService.toggleFollow(followerId, targetId);
      return res.status(200).json({
        success: true,
        message: result.following
          ? "Successfully followed user"
          : "Successfully unfollowed user",
        data: result,
      });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getFollowers(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res
          .status(400)
          .json({ success: false, message: "Missing userId" });
      }

      const parsedPage = Number(req.query.page);
      const page = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage);
      const parsedLimit = Number(req.query.limit);
      const limit = Number.isNaN(parsedLimit)
        ? 20
        : Math.min(Math.max(1, parsedLimit), 50);

      const result = await FollowService.getFollowers(userId, page, limit);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getFollowing(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res
          .status(400)
          .json({ success: false, message: "Missing userId" });
      }

      const parsedPage = Number(req.query.page);
      const page = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage);
      const parsedLimit = Number(req.query.limit);
      const limit = Number.isNaN(parsedLimit)
        ? 20
        : Math.min(Math.max(1, parsedLimit), 50);

      const result = await FollowService.getFollowing(userId, page, limit);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getStatus(req: Request, res: Response) {
    try {
      const followerId = req.user?.userId;
      if (!followerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { userId } = req.params;
      if (!userId) {
        return res
          .status(400)
          .json({ success: false, message: "Missing target userId" });
      }

      const status = await FollowService.getStatus(followerId, userId);
      return res.status(200).json({ success: true, data: status });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getCounts(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res
          .status(400)
          .json({ success: false, message: "Missing userId" });
      }

      const counts = await FollowService.getCounts(userId);
      return res.status(200).json({ success: true, data: counts });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getSuggestions(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const suggestions = await FollowService.getSuggestions(userId);
      return res.status(200).json({ success: true, data: suggestions });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
