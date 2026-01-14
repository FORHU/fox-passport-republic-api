import ReviewRepo from "../repositories/review.repository";

export default class ReviewSvc {
    static async createReview(data: any) {
        return ReviewRepo.createReview(data);
    }

    static async getVenueReviews(venueId: string) {
        return ReviewRepo.getVenueReviews(venueId);
    }

    static async getEventReviews(eventId: string) {
        return ReviewRepo.getEventReviews(eventId);
    }
}
