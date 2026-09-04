import { Request, Response } from "express";
import Joi from "joi";
import ReviewSvc from "./review.service";

/**
 * Ownership and existence failures are client errors and say so; anything else
 * is a server fault. Collapsing every throw into 400 is the same mistake that
 * made a missing table look like a wrong password on the login path.
 */
function reviewMutationStatus(e: unknown): number {
  const message = (e as Error)?.message;
  if (message === "Unauthorized") return 403;
  if (message === "Review not found") return 404;
  return 400;
}

export default class ReviewCtrl {
  static async createReview(req: Request, res: Response) {
    try {
      const review = await ReviewSvc.createReview({
        userId: req.user!.userId,
        bookingId: req.body.bookingId,
        entityId: req.body.targetId || req.body.entityId,
        entityType: req.body.targetType || req.body.type || req.body.entityType,
        rating: req.body.rating,
        comment: req.body.comment,
      });
      return res.status(201).json({ success: true, data: review });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async getAllReviews(req: Request, res: Response) {
    try {
      const { targetId, targetType, includeReplies } = req.query;
      const includeRepliesFlag = includeReplies === "true";
      if (targetId && targetType) {
        const reviews = await ReviewSvc.getReviewsByTarget(
          String(targetId),
          String(targetType),
          includeRepliesFlag,
        );
        return res.status(200).json({ success: true, data: reviews });
      }
      const reviews = await ReviewSvc.getAllReviews(includeRepliesFlag);
      return res.status(200).json({ success: true, data: reviews });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getReviewById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const includeReplies = req.query.includeReplies === "true";
      const review = await ReviewSvc.getReviewById(id, includeReplies);
      if (!review)
        return res
          .status(404)
          .json({ success: false, message: "Review not found" });
      return res.status(200).json({ success: true, data: review });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getListingReviews(req: Request, res: Response) {
    try {
      const { listingId } = req.params;
      const includeReplies = req.query.includeReplies === "true";
      const result = await ReviewSvc.getListingReviews(
        listingId,
        includeReplies,
      );
      return res.status(200).json({ success: true, data: result });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getActivity(req: Request, res: Response) {
    try {
      const limit = Math.min(Number(req.query.limit) || 10, 20);
      const includeReplies = req.query.includeReplies === "true";
      const activity = await ReviewSvc.getRecentActivity(limit, includeReplies);
      return res.status(200).json({ success: true, data: activity });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getUserReviews(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const includeReplies = req.query.includeReplies === "true";
      const reviews = await ReviewSvc.getUserReviews(userId, includeReplies);
      return res.status(200).json({ success: true, data: reviews });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  static async replyToReview(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { text } = req.body;
      const reply = await ReviewSvc.replyToReview(id, req.user!.userId, text);
      return res.status(201).json({ success: true, data: reply });
    } catch (e: unknown) {
      const error = e as Error;
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  static async updateReview(req: Request, res: Response) {
    // `req.body` used to be forwarded to `prisma.review.update` untouched, so
    // any column on Review was writable. Only these two ever should be.
    const schema = Joi.object({
      rating: Joi.number().integer().min(1).max(5).optional(),
      comment: Joi.string().allow("").optional(),
    }).min(1);

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    try {
      const requesterId = req.user?.userId;
      if (!requesterId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      const review = await ReviewSvc.updateReview({
        id: String(req.params.id),
        requesterId,
        requesterRole: req.user?.systemRole,
        data: value,
      });
      return res.status(200).json({ success: true, data: review });
    } catch (e: unknown) {
      return res
        .status(reviewMutationStatus(e))
        .json({ success: false, message: (e as Error).message });
    }
  }

  static async deleteReview(req: Request, res: Response) {
    try {
      const requesterId = req.user?.userId;
      if (!requesterId) {
        return res
          .status(401)
          .json({ success: false, message: "Unauthorized" });
      }

      await ReviewSvc.deleteReview({
        id: String(req.params.id),
        requesterId,
        requesterRole: req.user?.systemRole,
      });
      return res
        .status(200)
        .json({ success: true, message: "Review deleted successfully" });
    } catch (e: unknown) {
      return res
        .status(reviewMutationStatus(e))
        .json({ success: false, message: (e as Error).message });
    }
  }
}
