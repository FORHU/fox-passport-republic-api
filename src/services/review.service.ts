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
        // Since listing can be venue or event, we might need a more complex check or just try both.
        // For simplicity, let's assume it's venue for now if not specified.
        return ReviewRepo.getVenueReviews(listingId);
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
