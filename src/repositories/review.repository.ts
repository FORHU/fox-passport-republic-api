import { prisma } from "../utils/prisma";

const USER_SELECT = {
  select: { id: true, name: true, imgId: true },
} as const;

export default class ReviewRepo {
    // READ ALL
    static async getAllReviews() {
        return prisma.review.findMany({
            include: { user: USER_SELECT },
            orderBy: { createdAt: "desc" },
        });
    }

    // RECENT ACTIVITY — latest public reviews across all entities (landing page feed)
    static async getRecentActivity(limit = 10) {
        return prisma.review.findMany({
            include: { user: USER_SELECT },
            orderBy: { createdAt: "desc" },
            take: limit,
        });
    }

    // LISTING REVIEWS + rating distribution
    static async getListingReviewsWithDistribution(entityId: string) {
        const reviews = await prisma.review.findMany({
            where: { entityId: String(entityId) },
            include: { user: USER_SELECT },
            orderBy: { createdAt: "desc" },
        });

        // Compute rating distribution as percentages
        const total = reviews.length;
        const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        for (const r of reviews) {
            const star = Math.min(5, Math.max(1, Math.round(r.rating)));
            counts[star] = (counts[star] || 0) + 1;
        }
        const ratingDistribution: Record<number, string> = {};
        for (const star of [5, 4, 3, 2, 1]) {
            ratingDistribution[star] = total > 0 ? `${Math.round((counts[star] / total) * 100)}%` : "0%";
        }

        return { reviews, ratingDistribution };
    }

    // READ ONE
    static async getReviewById(id: string) {
        return prisma.review.findUnique({
            where: { id: String(id) },
            include: { user: USER_SELECT },
        });
    }

    // CREATE
    static async createReview(data: {
        userId: string;
        entityId: string;
        entityType: string;
        rating: number;
        comment?: string;
    }) {
        return prisma.review.create({
            data: {
                userId: String(data.userId),
                entityId: String(data.entityId),
                entityType: String(data.entityType),
                rating: data.rating,
                comment: data.comment,
            },
            include: { user: USER_SELECT },
        });
    }

    // LIST BY VENUE
    static async getVenueReviews(venueId: string) {
        return prisma.review.findMany({
            where: { entityType: "venue", entityId: String(venueId) },
            include: { user: USER_SELECT },
            orderBy: { createdAt: "desc" },
        });
    }

    // LIST BY EVENT
    static async getEventReviews(eventId: string) {
        return prisma.review.findMany({
            where: { entityType: "event", entityId: String(eventId) },
            include: { user: USER_SELECT },
            orderBy: { createdAt: "desc" },
        });
    }

    // LIST BY USER
    static async getUserReviews(userId: string) {
        return prisma.review.findMany({
            where: { userId: String(userId) },
            include: { user: USER_SELECT },
            orderBy: { createdAt: "desc" },
        });
    }

    // UPDATE
    static async updateReview(id: string, data: Partial<{ rating: number; comment: string }>) {
        return prisma.review.update({
            where: { id: String(id) },
            data,
        });
    }

    // DELETE
    static async deleteReview(id: string) {
        return prisma.review.delete({
            where: { id: String(id) },
        });
    }
}
