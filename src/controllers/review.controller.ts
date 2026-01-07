import { Request, Response } from "express";
import Joi from "joi";
import ReviewSvc from "../services/review.service";

export default class ReviewController {
    // GET ALL REVIEWS
    static async getAllReviews(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                listingId: Joi.string().uuid().optional(),
                userId: Joi.string().uuid().optional(),
                isVerifiedAttendee: Joi.boolean().optional(),
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const reviews = await ReviewSvc.getAllReviews(value);
            return res.status(200).json({
                success: true,
                count: reviews.length,
                data: reviews,
            });
        } catch (error: any) {
            console.error("Get all reviews error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch reviews",
            });
        }
    }

    // GET REVIEW BY ID
    static async getReviewById(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const review = await ReviewSvc.getReviewById(value.id);
            return res.status(200).json({
                success: true,
                data: review,
            });
        } catch (error: any) {
            console.error("Get review by ID error:", error);
            if (error.message === "Review not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch review",
            });
        }
    }

    // CREATE REVIEW
    static async createReview(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                listingId: Joi.string().uuid().required(),
                userId: Joi.string().uuid().required(),
                rating: Joi.number().integer().min(1).max(5).required(),
                comment: Joi.string().max(1000).optional(),
                isVerifiedAttendee: Joi.boolean().optional(),
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const review = await ReviewSvc.createReview(value);
            return res.status(201).json({
                success: true,
                message: "Review created successfully",
                data: review,
            });
        } catch (error: any) {
            console.error("Create review error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to create review",
            });
        }
    }

    // UPDATE REVIEW
    static async updateReview(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
                rating: Joi.number().integer().min(1).max(5).optional(),
                comment: Joi.string().max(1000).optional(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            const { userId, ...updateData } = body;
            const review = await ReviewSvc.updateReview(params.id, userId, updateData);

            return res.status(200).json({
                success: true,
                message: "Review updated successfully",
                data: review,
            });
        } catch (error: any) {
            console.error("Update review error:", error);
            if (error.message === "Review not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to update review",
            });
        }
    }

    // DELETE REVIEW
    static async deleteReview(req: Request, res: Response) {
        try {
            const paramsSchema = Joi.object({
                id: Joi.string().uuid().required(),
            });

            const { error: paramsError, value: params } = paramsSchema.validate(req.params);
            if (paramsError) {
                return res.status(400).json({ message: paramsError.message });
            }

            const bodySchema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error: bodyError, value: body } = bodySchema.validate(req.body);
            if (bodyError) {
                return res.status(400).json({ message: bodyError.message });
            }

            await ReviewSvc.deleteReview(params.id, body.userId);

            return res.status(200).json({
                success: true,
                message: "Review deleted successfully",
            });
        } catch (error: any) {
            console.error("Delete review error:", error);
            if (error.message === "Review not found") {
                return res.status(404).json({
                    success: false,
                    message: error.message,
                });
            }
            if (error.message.includes("Unauthorized")) {
                return res.status(403).json({
                    success: false,
                    message: error.message,
                });
            }
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to delete review",
            });
        }
    }

    // GET LISTING REVIEWS
    static async getListingReviews(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                listingId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const reviews = await ReviewSvc.getListingReviews(value.listingId);
            return res.status(200).json({
                success: true,
                count: reviews.length,
                data: reviews,
            });
        } catch (error: any) {
            console.error("Get listing reviews error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch listing reviews",
            });
        }
    }

    // GET USER REVIEWS
    static async getUserReviews(req: Request, res: Response) {
        try {
            const schema = Joi.object({
                userId: Joi.string().uuid().required(),
            });

            const { error, value } = schema.validate(req.params);
            if (error) {
                return res.status(400).json({ message: error.message });
            }

            const reviews = await ReviewSvc.getUserReviews(value.userId);
            return res.status(200).json({
                success: true,
                count: reviews.length,
                data: reviews,
            });
        } catch (error: any) {
            console.error("Get user reviews error:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Failed to fetch user reviews",
            });
        }
    }
}
