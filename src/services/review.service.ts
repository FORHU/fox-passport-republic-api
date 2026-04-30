import ReviewRepo from "../repositories/review.repository";

export default class ReviewSvc {
    static async createReview(data: any) {
        return ReviewRepo.createReview(data);
    }

    static async getAllReviews() {
        return ReviewRepo.getAllReviews();
    }

    static async getReviewById(id: string) {
        return ReviewRepo.getReviewById(id);
    }

    static async getVenueReviews(venueId: string) {
        return ReviewRepo.getVenueReviews(venueId);
    }

    static async getEventReviews(eventId: string) {
        return ReviewRepo.getEventReviews(eventId);
    }

    static async getListingReviews(listingId: string) {
        return ReviewRepo.getListingReviewsWithDistribution(listingId);
    }

    static async getRecentActivity(limit: number) {
        return ReviewRepo.getRecentActivity(limit);
    }

    static async getUserReviews(userId: string) {
        return ReviewRepo.getUserReviews(userId);
    }

    static async updateReview(id: string, data: any) {
        return ReviewRepo.updateReview(id, data);
    }

    static async deleteReview(id: string) {
        return ReviewRepo.deleteReview(id);
    }
}
