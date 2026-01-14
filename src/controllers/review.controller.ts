import { Request, Response } from "express";
import ReviewSvc from "../services/review.service";

export default class ReviewCtrl {
    static async createReview(req: Request, res: Response) {
        try {
            const review = await ReviewSvc.createReview({
                userId: req.user!.id,
                ...req.body
            });
            return res.status(201).json({ success: true, data: review });
        } catch (error: any) {
            return res.status(400).json({ success: false, message: error.message });
        }
    }
}
