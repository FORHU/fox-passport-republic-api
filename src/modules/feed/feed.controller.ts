import { Request, Response } from "express";
import Joi from "joi";
import FeedService from "./feed.service";
import { PostType, FeedTab } from "@prisma/client";

function statusForError(message: string): number {
  if (message.includes("Unauthorized") || message.includes("does not belong to you")) return 403;
  if (message.includes("not found")) return 404;
  return 400;
}

export default class FeedController {
  static async getFeed(req: Request, res: Response) {
    try {
      const { tab, type, authorId, search, limit, cursor } = req.query;
      const parsedLimit = limit ? parseInt(limit as string, 10) : NaN;

      const result = await FeedService.getFeed({
        tab: tab && tab !== "all" ? (tab as FeedTab) : undefined,
        type: type as PostType | undefined,
        authorId: authorId as string | undefined,
        search: search as string | undefined,
        limit: Number.isNaN(parsedLimit)
          ? undefined
          : Math.min(50, Math.max(1, parsedLimit)),
        cursor: cursor as string | undefined,
        viewerId: req.user?.userId,
      });

      return res.status(200).json({
        success: true,
        data: result.posts,
        nextCursor: result.nextCursor,
      });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getPostById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const post = await FeedService.getPostById(id, req.user?.userId);
      return res.status(200).json({ success: true, data: post });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(statusForError(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async createPost(req: Request, res: Response) {
    const schema = Joi.object({
      type: Joi.string()
        .valid(...Object.values(PostType))
        .required(),
      content: Joi.string().trim().min(1).max(5000).required(),
      mediaUrls: Joi.array().items(Joi.string().uri()).max(10).optional(),
      venueId: Joi.string().optional().allow(null),
      assetId: Joi.string().optional().allow(null),
      serviceId: Joi.string().optional().allow(null),
      eventId: Joi.string().optional().allow(null),
      reviewId: Joi.string().optional().allow(null),
      stampId: Joi.string().optional().allow(null),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    try {
      const post = await FeedService.createPost(req.user!, value);
      return res.status(201).json({ success: true, data: post });
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async deletePost(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await FeedService.deletePost(id, req.user!);
      return res.status(200).json({ success: true, message: "Post deleted" });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(statusForError(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async toggleLike(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await FeedService.toggleLike(id, req.user!);
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(statusForError(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async getComments(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { limit, cursor } = req.query;
      const comments = await FeedService.getComments(
        id,
        limit ? parseInt(limit as string, 10) : 50,
        cursor as string | undefined,
      );
      return res.status(200).json({ success: true, data: comments });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(statusForError(error.message))
        .json({ success: false, message: error.message });
    }
  }

  static async addComment(req: Request, res: Response) {
    const schema = Joi.object({
      content: Joi.string().trim().min(1).max(1000).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    try {
      const { id } = req.params;
      const comment = await FeedService.addComment(id, req.user!, value.content);
      return res.status(201).json({ success: true, data: comment });
    } catch (e: unknown) {
      const err = e as Error;
      return res
        .status(statusForError(err.message))
        .json({ success: false, message: err.message });
    }
  }

  static async deleteComment(req: Request, res: Response) {
    try {
      const { commentId } = req.params;
      await FeedService.deleteComment(commentId, req.user!);
      return res.status(200).json({ success: true, message: "Comment deleted" });
    } catch (e: unknown) {
      const error = e as Error;
      return res
        .status(statusForError(error.message))
        .json({ success: false, message: error.message });
    }
  }
}
