import { Request, Response } from "express";
import ReviewSvc from "../services/review.service";

export default class ReviewCtrl {
    static async createReview(req: Request, res: Response) {
        try {
            const review = await ReviewSvc.createReview({
                userId: req.user!.userId,
                ...req.body
            });
            return res.status(201).json({ success: true, data: review });
        } catch (error: any) {
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
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getReviewById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const includeReplies = req.query.includeReplies === "true";
            const review = await ReviewSvc.getReviewById(id, includeReplies);
            if (!review) return res.status(404).json({ success: false, message: "Review not found" });
            return res.status(200).json({ success: true, data: review });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getListingReviews(req: Request, res: Response) {
        try {
            const { listingId } = req.params;
            const includeReplies = req.query.includeReplies === "true";
            const result = await ReviewSvc.getListingReviews(listingId, includeReplies);
            return res.status(200).json({ success: true, data: result });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getActivity(req: Request, res: Response) {
        try {
            const limit = Math.min(Number(req.query.limit) || 10, 20);
            const includeReplies = req.query.includeReplies === "true";
            const activity = await ReviewSvc.getRecentActivity(limit, includeReplies);
            return res.status(200).json({ success: true, data: activity });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getUserReviews(req: Request, res: Response) {
        try {
            const { userId } = req.params;
            const includeReplies = req.query.includeReplies === "true";
            const reviews = await ReviewSvc.getUserReviews(userId, includeReplies);
            return res.status(200).json({ success: true, data: reviews });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    static async replyToReview(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { text } = req.body;
            const reply = await ReviewSvc.replyToReview(id, req.user!.userId, text);
            return res.status(201).json({ success: true, data: reply });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async updateReview(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const review = await ReviewSvc.updateReview(id, req.body);
            return res.status(200).json({ success: true, data: review });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }

    static async deleteReview(req: Request, res: Response) {
        try {
            const { id } = req.params;
            await ReviewSvc.deleteReview(id);
            return res.status(200).json({ success: true, message: "Review deleted successfully" });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
}
