import ReviewRepo from "../repositories/review.repository";

export default class ReviewSvc {
    // GET ALL REVIEWS
    static async getAllReviews(filters?: {
        eventId?: string;
        userId?: string;
        isVerifiedAttendee?: boolean;
    }) {
        return ReviewRepo.getAllReviews(filters);
    }

    // GET REVIEW BY ID
    static async getReviewById(id: string) {
        const review = await ReviewRepo.getReviewById(id);
        if (!review) {
            throw new Error("Review not found");
        }
        return review;
    }

    // CREATE REVIEW
    static async createReview(data: {
        eventId: string;
        userId: string;
        rating: number;
        comment?: string;
        isVerifiedAttendee?: boolean;
    }) {
        // Validate rating range
        if (data.rating < 1 || data.rating > 5) {
            throw new Error("Rating must be between 1 and 5");
        }

        return ReviewRepo.createReview(data);
    }

    // UPDATE REVIEW
    static async updateReview(
        id: string,
        userId: string,
        data: Partial<{
            rating: number;
            comment: string;
        }>
    ) {
        // Check if review exists
        const exists = await ReviewRepo.reviewExists(id);
        if (!exists) {
            throw new Error("Review not found");
        }

        // Check if user owns the review
        const isOwner = await ReviewRepo.isReviewOwner(id, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You can only update your own reviews");
        }

        // Validate rating if provided
        if (data.rating && (data.rating < 1 || data.rating > 5)) {
            throw new Error("Rating must be between 1 and 5");
        }

        return ReviewRepo.updateReview(id, data);
    }

    // DELETE REVIEW
    static async deleteReview(id: string, userId: string) {
        // Check if review exists
        const exists = await ReviewRepo.reviewExists(id);
        if (!exists) {
            throw new Error("Review not found");
        }

        // Check if user owns the review
        const isOwner = await ReviewRepo.isReviewOwner(id, userId);
        if (!isOwner) {
            throw new Error("Unauthorized: You can only delete your own reviews");
        }

        return ReviewRepo.deleteReview(id);
    }

    // GET EVENT REVIEWS
    static async getEventReviews(eventId: string) {
        return ReviewRepo.getEventReviews(eventId);
    }

    // GET USER REVIEWS
    static async getUserReviews(userId: string) {
        return ReviewRepo.getUserReviews(userId);
    }
}
