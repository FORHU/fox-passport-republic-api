import { Request, Response } from "express";
import FollowService from "./follow.service";

function parsePage(req: Request, defaultLimit = 20) {
  const parsedPage = Number(req.query.page);
  const page = Number.isNaN(parsedPage) ? 1 : Math.max(1, parsedPage);
  const parsedLimit = Number(req.query.limit);
  const limit = Number.isNaN(parsedLimit)
    ? defaultLimit
    : Math.min(Math.max(1, parsedLimit), 50);
  return { page, limit };
}

export default class FollowController {
  static async sendFollow(req: Request, res: Response) {
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

      const result = await FollowService.sendFollow(followerId, targetId);
      return res.status(200).json({
        success: true,
        message:
          result.status === "pending"
            ? "Follow request sent"
            : "Successfully followed user",
        data: result,
      });
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      return res
        .status(err.status ?? 400)
        .json({ success: false, message: err.message });
    }
  }

  static async removeFollow(req: Request, res: Response) {
    try {
      const followerId = req.user?.userId;
      if (!followerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { targetId } = req.params;
      const result = await FollowService.removeFollow(followerId, targetId);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  static async acceptRequest(req: Request, res: Response) {
    try {
      const followingId = req.user?.userId;
      if (!followingId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { requesterId } = req.params;
      const result = await FollowService.acceptRequest(
        followingId,
        requesterId,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  static async declineRequest(req: Request, res: Response) {
    try {
      const followingId = req.user?.userId;
      if (!followingId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { requesterId } = req.params;
      const result = await FollowService.declineRequest(
        followingId,
        requesterId,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  static async getRequests(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { page, limit } = parsePage(req);
      const result = await FollowService.getRequests(userId, page, limit);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  static async getFollowers(req: Request, res: Response) {
    try {
      const viewerId = req.user?.userId;
      if (!viewerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { userId } = req.params;
      const { page, limit } = parsePage(req);
      const result = await FollowService.getFollowers(
        viewerId,
        userId,
        page,
        limit,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      return res
        .status(err.status ?? 500)
        .json({ success: false, message: err.message });
    }
  }

  static async getFollowing(req: Request, res: Response) {
    try {
      const viewerId = req.user?.userId;
      if (!viewerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { userId } = req.params;
      const { page, limit } = parsePage(req);
      const result = await FollowService.getFollowing(
        viewerId,
        userId,
        page,
        limit,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      return res
        .status(err.status ?? 500)
        .json({ success: false, message: err.message });
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
      const viewerId = req.user?.userId;
      if (!viewerId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const { userId } = req.params;
      if (!userId) {
        return res
          .status(400)
          .json({ success: false, message: "Missing userId" });
      }

      const counts = await FollowService.getCounts(viewerId, userId);
      return res.status(200).json({ success: true, data: counts });
    } catch (e: unknown) {
      const err = e as Error & { status?: number };
      return res
        .status(err.status ?? 500)
        .json({ success: false, message: err.message });
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

      const { page, limit } = parsePage(req, 10);
      const suggestions = await FollowService.getSuggestions(
        userId,
        page,
        limit,
      );
      return res.status(200).json({ success: true, data: suggestions });
    } catch (e: unknown) {
      const err = e as Error;
      return res.status(500).json({ success: false, message: err.message });
    }
  }
}
